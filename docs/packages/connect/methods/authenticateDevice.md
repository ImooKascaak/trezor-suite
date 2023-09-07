## authenticateDevice

> :note: **Supported only by T2B1 devices**

Request a signature and validate certificate issued by the Trezor company.
Returns `caPubKey` of the certificate or failed validation reason.

### Params

[Optional common params](commonParams.md)

### Example

```javascript
TrezorConnect.authenticateDevice();
```

### Result

```javascript
{
    success: true,
    payload: {
        valid: true,
        caPubKey: string;
    }
}
```

Error

```javascript
{
    success: true,
    payload: {
        valid: false,
        error: string;
    }
}
```
