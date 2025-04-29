# Changelog

All notable changes to this project will be documented in this file.

## [3.1.0] - 2025-04-29

### Added
- ✅ **Transform support** via new `transforms` array and `shouldTransform` callback.
  - Allows applying custom stream transformations (e.g. image resizing via `sharp`) before upload.
  - `transforms[]` accepts an `id`, `transform(req, file, cb)` method, and a custom filename per transform.
  - `shouldTransform(req, file)` enables conditional logic (e.g. only for image types).
- ✅ **Enhanced typings** and modular AWS SDK v3 usage.

### Changed
- Switched to modern `@aws-sdk/lib-storage` Upload handling.
- Default content-type detection improved (SVGs, XML, etc.).
- Updated documentation with full transform usage examples.

### Fixed
- Improved test stability and mocking with updated test runner and S3 client compatibility.