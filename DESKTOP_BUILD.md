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
2. Installs Python, Node.js, and Rust build dependencies.
3. Packages FastAPI as `virtual-company-backend.exe` with PyInstaller.
4. Generates Windows application icons.
5. Builds the Tauri NSIS installer for `x86_64-pc-windows-msvc`.
6. Uploads the installer as a GitHub Actions artifact.
7. Attaches `VirtualCompany_<version>_x64-setup.exe` to the published GitHub Release.

The workflow can also be run manually with `workflow_dispatch`; manual runs produce a workflow artifact but do not modify a GitHub Release.

## Versioning

The source baseline version is stored in:

- `frontend/package.json`
- `frontend/src-tauri/Cargo.toml`
- `frontend/src-tauri/tauri.conf.json`

Release builds override the Tauri/Cargo version from the release tag and pass the same version to the frontend through `VITE_APP_VERSION`.

## Data and upgrades

The packaged backend receives its SQLite path from Tauri through `AI_TEAM_DB`. The database is kept in the per-user application data directory instead of the installation folder. Reinstalling or upgrading the application therefore does not intentionally overwrite the workspace database.

## Signing

The current installer is **unsigned**. Windows SmartScreen can warn users about unsigned installers. Production distribution should later add an Authenticode code-signing certificate to the release workflow.
