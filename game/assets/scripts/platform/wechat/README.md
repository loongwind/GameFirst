# WeChat adapter slot

P1-01 intentionally supplies no WeChat implementation. Stage three will implement
`PlatformAdapter` using native storage, lifecycle and device APIs after AppID setup.
The factory rejects WeChat until then; never fall back to the browser or a mock.
