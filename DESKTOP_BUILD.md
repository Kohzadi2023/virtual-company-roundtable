# Virtual Company Desktop Build

The Windows desktop distribution uses:

- **Tauri 2** for the native desktop shell and NSIS installer.
- **PyInstaller** for the FastAPI backend sidecar.
- **React/Vite** for the existing UI.
- **SQLite** in the Tauri application data directory, outside the install directory, so application upgrades do not remove workspace data.

## Runtime architecture

```text
Virtual Company.exe (Tauri)
  ├─ bundled React/Vite frontend
  └─ virtual-company-backend.exe (PyInstaller sidecar)
       ├─ FastAPI on 127.0.0.1:8765 only
       └─ SQLite in the per-user Tauri app-data directory
```

The browser/web development path still uses relative `/api` requests. Desktop release builds set `VITE_API_BASE_URL=http://127.0.0.1:8765` so the bundled UI talks to the local sidecar.

## Local Windows development

Prerequisites:

- Windows 10/11 with WebView2 available.
- Python 3.12.
- Node.js 20+.
- Rust stable with the MSVC toolchain.

Start desktop development mode:

```powershell
.\scripts\run-desktop.ps1
```

Build the Windows installer locally:

```powershell
.\scripts\run-desktop.ps1 -Build
```

The helper script builds the Python sidecar with the Tauri-required target-triple filename, generates desktop icons from `frontend/src-tauri/app-icon.svg`, and runs the Tauri build.

The NSIS output is under:

```text
frontend/src-tauri/target/release/bundle/nsis/
```

or, when an explicit Rust target is used:

```text
frontend/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

## GitHub Release automation

Workflow: `.github/workflows/windows-desktop-release.yml`

When a GitHub Release is **published**, the workflow:

1. Reads the release tag (for example `v1.8.0`) and embeds that version into Tauri/Cargo for the build.
2. Detects whether Windows Authenticode signing secrets are configured.
3. If signing is enabled, imports the PFX certificate into the ephemeral GitHub runner certificate store and configures Tauri for SHA-256 + RFC 3161 timestamping.
4. Installs Python, Node.js, and Rust build dependencies.
5. Packages FastAPI as `virtual-company-backend.exe` with PyInstaller and signs the sidecar before bundling.
6. Generates Windows application icons.
7. Builds the Tauri NSIS installer for `x86_64-pc-windows-msvc`; Tauri signs the desktop executable and Windows bundle when a certificate is configured.
8. Verifies the final application and Setup signatures with Windows `signtool`.
9. Uploads the installer as a GitHub Actions artifact.
10. Attaches `VirtualCompany_<version>_x64-setup.exe` to the published GitHub Release.

The workflow can also be run manually with `workflow_dispatch`; manual runs produce a workflow artifact but do not modify a GitHub Release.

## Versioning

The source baseline version is stored in:

- `frontend/package.json`
- `frontend/src-tauri/Cargo.toml`
- `frontend/src-tauri/tauri.conf.json`

Release builds override the Tauri/Cargo version from the release tag and pass the same version to the frontend through `VITE_APP_VERSION`.

## Data and upgrades

The packaged backend receives its SQLite path from Tauri through `AI_TEAM_DB`. The database is kept in the per-user application data directory instead of the installation folder. Reinstalling or upgrading the application therefore does not intentionally overwrite the workspace database.

## Windows Authenticode signing

Signing is optional at build time but strongly recommended for public Windows distribution. When signing secrets are absent, the release workflow still produces an unsigned installer and writes a warning to the GitHub Actions summary. When the secrets are present, the PyInstaller sidecar, Tauri application executable, and final NSIS Setup are signed and verified.

### 1. Obtain a Windows code-signing certificate

Use a code-signing certificate/provider that supports Windows Authenticode. The workflow currently supports a password-protected `.pfx` certificate imported into the GitHub-hosted Windows runner.

Do **not** commit the `.pfx`, private key, export password, or Base64 certificate to the repository.

### 2. Convert the PFX to Base64

PowerShell example:

```powershell
$bytes = [IO.File]::ReadAllBytes('certificate.pfx')
[Convert]::ToBase64String($bytes) | Set-Clipboard
```

The clipboard now contains the value for the certificate secret.

### 3. Add GitHub Actions secrets

In the GitHub repository open:

```text
Settings → Secrets and variables → Actions
```

Add these **Repository secrets**:

```text
WINDOWS_CERTIFICATE_BASE64
WINDOWS_CERTIFICATE_PASSWORD
```

`WINDOWS_CERTIFICATE_BASE64` is the Base64 text from the `.pfx` file.

`WINDOWS_CERTIFICATE_PASSWORD` is the PFX export password.

Optionally add this **Repository variable**:

```text
WINDOWS_TIMESTAMP_URL
```

If it is not configured, the workflow uses:

```text
http://timestamp.digicert.com
```

Use the timestamp URL recommended by your certificate provider if it requires a different RFC 3161 endpoint.

### 4. Publish a release

Create and publish a GitHub Release such as:

```text
v1.8.0
```

The release workflow detects the secrets automatically. A signed build reports the certificate subject, expiration date, SHA-256 digest, and timestamp endpoint in the GitHub Actions summary.

### 5. Signature verification

The workflow verifies both the Tauri application executable and the staged Setup with `signtool verify /pa /v`. If signature verification fails, the release job fails before the asset is uploaded.

You can also verify a downloaded Setup locally:

```powershell
Get-AuthenticodeSignature .\VirtualCompany_1.8.0_x64-setup.exe | Format-List
```

For a correctly trusted build, `Status` should be `Valid`.

## CI coverage

`.github/workflows/desktop-ci.yml` continues to produce an unsigned smoke-build artifact for normal desktop changes. It also parses the signing helper scripts so PowerShell syntax errors are caught even when code-signing secrets are not available to CI.

The signing helpers are:

```text
scripts/import-windows-signing-certificate.ps1
scripts/sign-windows-file.ps1
```
