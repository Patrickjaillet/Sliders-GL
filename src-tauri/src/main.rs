// Prevent a console window from appearing in release builds on Windows.
// The `windows_subsystem` attribute must be on the *binary* crate root,
// not in lib.rs, so it lives here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    z_gl_lib::run();
}
