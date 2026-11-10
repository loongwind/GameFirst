"""Create bounded, traceable Cocos sea content from the read-only final art export.

Requires Pillow (python3 -m pip install Pillow). Run from any working directory.
Only generated game imports, their metadata, manifest, and SeaArt.ts are written.
All animation cells resize independently to preserve exact four-frame boundaries.
"""
from pathlib import Path
from PIL import Image
import copy
import csv
import hashlib
import json
import re
import uuid

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/game-assets/v1'
INDEX = SOURCE / 'asset-index-final.csv'
RIGS = SOURCE / 'boss-rigs-r9.json'
NAMESPACE = uuid.UUID('c5e8dff8-c956-52ee-86b3-17f850de1722')
LAYERS = ('sunlight', 'twilight', 'abyss')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path):
    return path.relative_to(ROOT).as_posix()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def stable_uuid(path):
    return str(uuid.uuid5(NAMESPACE, relative(path)))


def directory_meta(path, bundle=False):
    path.mkdir(parents=True, exist_ok=True)
    meta_path = path.with_name(path.name + '.meta')
    # Existing bundle UUIDs are part of the project; preserve their import identity.
    if meta_path.exists():
        return
    write_json(meta_path, {
        'ver': '1.2.0', 'importer': 'directory', 'imported': True,
        'uuid': stable_uuid(path), 'files': [], 'subMetas': {},
        'userData': {'isBundle': True, 'bundleName': path.name, 'priority': 1,
                     'compressionType': {}, 'isRemoteBundle': {}} if bundle else {},
    })


def image_meta(path, width, height, template):
    # Match the Cocos 3.8.8 image importer schema already used by harbor assets.
    meta = copy.deepcopy(template)
    uid = stable_uuid(path)
    meta['uuid'] = uid
    meta['userData'].update({'hasAlpha': True, 'redirect': uid + '@6c48a'})
    texture = meta['subMetas']['6c48a']
    texture.update({'uuid': uid + '@6c48a', 'displayName': path.stem})
    texture['userData']['imageUuidOrDatabaseUri'] = uid
    frame = meta['subMetas']['f9941']
    frame.update({'uuid': uid + '@f9941', 'displayName': path.stem})
    frame['userData'].update({
        'offsetX': 0, 'offsetY': 0, 'trimX': 0, 'trimY': 0,
        'width': width, 'height': height, 'rawWidth': width, 'rawHeight': height,
        'packable': False, 'trimType': 'none', 'imageUuidOrDatabaseUri': uid + '@6c48a',
        'vertices': {
            'rawPosition': [-width / 2, -height / 2, 0, width / 2, -height / 2, 0,
                            -width / 2, height / 2, 0, width / 2, height / 2, 0],
            'indexes': [0, 1, 2, 2, 1, 3],
            'uv': [0, height, width, height, 0, 0, width, 0],
            'nuv': [0, 0, 1, 0, 0, 1, 1, 1],
            'minPos': [-width / 2, -height / 2, 0],
            'maxPos': [width / 2, height / 2, 0],
        },
    })
    write_json(path.with_suffix('.png.meta'), meta)


def classify(row):
    key = row['id']
    if key == 'hero_ship':
        return 'player', (192, 192)
    if key.startswith('bg_') and key[3:] in LAYERS:
        return 'scene-far', (750, 1125)
    if key.startswith('reef_') and row['资源包'] in LAYERS:
        return 'scene-edge', (192, 768)
    if key.startswith('flora_') and key[6:] in LAYERS:
        return 'scene-flora', (256, 256)
    match = re.match(r'^enemy_(normal|elite)_', key)
    if match:
        size = 64 if match[1] == 'normal' else 96
        swim = key.endswith('_swim')
        return f'{match[1]}-' + ('swim' if swim else 'idle'), (size * 4 if swim else size, size)
    if key.startswith('enemy_boss_'):
        return ('boss-part', (320, 320)) if key.endswith('_tentacle') else ('boss-body', (480, 480))
    return None


def main():
    rows = list(csv.DictReader(INDEX.open(encoding='utf-8-sig', newline='')))
    template = json.loads((ROOT / 'game/assets/bundles/meta/ui/hero_h01_harbor.png.meta').read_text())
    records = []
    for row in rows:
        selected = classify(row)
        if selected is None:
            continue
        kind, (width, height) = selected
        original = SOURCE / row['path']
        if digest(original) != row['sha256']:
            raise ValueError(f'Production index hash mismatch: {row["id"]}')
        bundle = 'dive' if kind == 'player' else row['资源包']
        bundle_path = ROOT / 'game/assets/bundles' / bundle
        directory_meta(bundle_path, bundle=True)
        directory_meta(bundle_path / 'content')
        output = bundle_path / 'content' / Path(row['path']).name
        with Image.open(original) as image:
            if image.size != (int(row['宽px']), int(row['高px'])):
                raise ValueError(f'Production index dimensions mismatch: {row["id"]}')
            image = image.convert('RGBA')
            if kind.endswith('-swim'):
                cell = image.width // 4
                if image.width != image.height * 4:
                    raise ValueError(f'Invalid animation strip: {row["id"]}')
                resized = Image.new('RGBA', (width, height))
                for frame in range(4):
                    tile = image.crop((frame * cell, 0, (frame + 1) * cell, cell))
                    tile = tile.resize((height, height), Image.Resampling.LANCZOS)
                    resized.paste(tile, (frame * height, 0))
            else:
                resized = image.resize((width, height), Image.Resampling.LANCZOS)
            resized.save(output, optimize=True, compress_level=9)
        image_meta(output, width, height, template)
        record = {'key': row['id'], 'bundle': bundle, 'kind': kind,
                  'sourcePath': relative(original), 'sourceSha256': row['sha256'],
                  'importPath': relative(output), 'importSha256': digest(output),
                  'loadPath': 'content/' + output.stem, 'width': width, 'height': height,
                  'bytes': output.stat().st_size}
        if kind.endswith('-swim'):
            record.update({'fps': 6, 'frames': [[i * height, 0, height, height] for i in range(4)]})
        records.append(record)

    identities = {}
    for row in rows:
        key = row['id']
        if re.match(r'^enemy_(normal|elite|boss)_', key) and not key.endswith(('_swim', '_tentacle')):
            kind = key.split('_')[1]
            identities[key] = {'layer': row['资源包'], 'kind': kind, 'idle': key}
            identities[key]['part' if kind == 'boss' else 'swim'] = key + ('_tentacle' if kind == 'boss' else '_swim')
    by_source = {r['sourcePath'].removeprefix('output/game-assets/v1/'): r['key'] for r in records}
    rigs = {}
    for rig in json.loads(RIGS.read_text())['rigs']:
        rigs[rig['id']] = {
            'bodyKey': by_source[rig['body']], 'partKey': by_source[rig['part']],
            'sourceBodySize': 768, 'sourcePartSize': 512,
            'socket': rig['cocos_node_position_from_body_center'],
            'anchor': rig['part_anchor_bottom_left'], 'scale': rig['part_scale'],
            'angles': rig['part_instances_angles_deg'], 'swing': rig['preview_swing_degrees'],
        }
    bundles = {}
    for bundle in (*LAYERS, 'dive'):
        assets = [r for r in records if r['bundle'] == bundle]
        bundles[bundle] = {
            'pngBytes': sum(r['bytes'] for r in assets),
            'rgbaBytes': sum(r['width'] * r['height'] * 4 for r in assets),
            'downloadBudgetBytes': (2 if bundle == 'sunlight' else 1 if bundle == 'dive' else 4) * 1024 * 1024,
            'textureBudgetBytes': (1 if bundle == 'dive' else 12) * 1024 * 1024,
        }
    manifest = {'version': 1, 'sourceIndex': relative(INDEX), 'sourceIndexSha256': digest(INDEX),
                'sourceRigs': relative(RIGS), 'sourceRigsSha256': digest(RIGS),
                'animationFps': 6, 'maxTextureEdge': 2048, 'bundles': bundles,
                'identities': identities, 'assets': records}
    write_json(ROOT / 'game/sea-assets.json', manifest)
    art = {r['key']: {**{k: r[k] for k in ('bundle', 'width', 'height', 'kind')}, 'path': r['loadPath'],
                      **({'frames': r['frames'], 'fps': r['fps']} if 'frames' in r else {})} for r in records}
    scenes = {layer: {'far': f'bg_{layer}', 'left': f'reef_{layer}_left',
                      'right': f'reef_{layer}_right', 'flora': f'flora_{layer}'} for layer in LAYERS}
    code = '''// Generated by tools/prepare-sea-assets.py. Source art and r9 rigs remain read-only.
export type SeaLayerId = 'sunlight' | 'twilight' | 'abyss';
export type SeaFrameRect = readonly [number, number, number, number];
export interface SeaArtAsset { bundle: string; path: string; width: number; height: number; kind: string; frames?: readonly SeaFrameRect[]; fps?: number }
export interface SeaIdentityArt { layer: SeaLayerId; kind: 'normal' | 'elite' | 'boss'; idle: string; swim?: string; part?: string }
/** Socket uses bottom-left axes relative to full 768px body center. Multiply by rendered body width / 768.
 * Part canvas size is rendered body width * 512 / 768; then apply scale, anchor, angle + swing. */
export interface BossArtRig { bodyKey: string; partKey: string; sourceBodySize: number; sourcePartSize: number; socket: readonly [number, number]; anchor: readonly [number, number]; scale: number; angles: readonly number[]; swing: readonly number[] }
export const PLAYER_ART = 'hero_ship';
'''
    for name, value, type_name in [('SEA_ART', art, 'Readonly<Record<string, SeaArtAsset>>'),
                                    ('SEA_IDENTITIES', identities, 'Readonly<Record<string, SeaIdentityArt>>'),
                                    ('SEA_SCENES', scenes, 'Readonly<Record<SeaLayerId, { far: string; left: string; right: string; flora: string }>>'),
                                    ('BOSS_RIGS', rigs, 'Readonly<Record<string, BossArtRig>>')]:
        code += f'export const {name}: {type_name} = ' + json.dumps(value, ensure_ascii=False, indent=2) + ';\n'
    art_path = ROOT / 'game/assets/scripts/ui/SeaArt.ts'
    art_path.write_text(code, encoding='utf-8')
    script_meta = art_path.with_suffix('.ts.meta')
    if not script_meta.exists():
        write_json(script_meta, {'ver': '4.0.24', 'importer': 'typescript', 'imported': True,
                                'uuid': stable_uuid(art_path), 'files': [], 'subMetas': {}, 'userData': {}})
    for bundle, totals in bundles.items():
        print(f'{bundle}: PNG {totals["pngBytes"]:,} / {totals["downloadBudgetBytes"]:,} bytes; RGBA {totals["rgbaBytes"]:,} bytes')
        if totals['pngBytes'] > totals['downloadBudgetBytes'] or totals['rgbaBytes'] > totals['textureBudgetBytes']:
            raise ValueError(f'Asset budget exceeded: {bundle}')
    print(f'Imported {len(records)} textures, {len(identities)} identities, {len(rigs)} r9 boss rigs.')


if __name__ == '__main__':
    main()
