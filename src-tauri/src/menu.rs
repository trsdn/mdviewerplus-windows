use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("new", "New File")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open", "Open…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("save_as", "Save As…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("previous_file", "Previous Markdown File")
                .accelerator("CmdOrCtrl+Alt+Left")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("next_file", "Next Markdown File")
                .accelerator("CmdOrCtrl+Alt+Right")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(
            &MenuItemBuilder::with_id("find", "Find…")
                .accelerator("CmdOrCtrl+F")
                .build(app)?,
        )
        .build()?;

    let format_menu = SubmenuBuilder::new(app, "Format")
        .item(
            &MenuItemBuilder::with_id("format_bold", "Bold")
                .accelerator("CmdOrCtrl+B")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("format_italic", "Italic")
                .accelerator("CmdOrCtrl+I")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("format_link", "Link")
                .accelerator("CmdOrCtrl+K")
                .build(app)?,
        )
        .build()?;

    let appearance_submenu = SubmenuBuilder::new(app, "Appearance")
        .item(
            &MenuItemBuilder::with_id("theme_system", "System")
                .accelerator("CmdOrCtrl+Shift+0")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("theme_light", "Light")
                .accelerator("CmdOrCtrl+Shift+1")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("theme_dark", "Dark")
                .accelerator("CmdOrCtrl+Shift+2")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("theme_settings", "Theme Settings…").build(app)?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("toggle_edit_mode", "Toggle Edit Mode")
                .accelerator("CmdOrCtrl+E")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("zoom_in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom_reset", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .separator()
        .item(&appearance_submenu)
        .build()?;

    let menu = Menu::new(app)?;
    menu.append(&file_menu)?;
    menu.append(&edit_menu)?;
    menu.append(&view_menu)?;
    menu.append(&format_menu)?;

    Ok(menu)
}

pub fn setup_menu_events(app: &AppHandle) {
    let app_handle = app.clone();
    app.on_menu_event(move |_app, event| {
        let id = event.id().as_ref();
        let _ = app_handle.emit("menu-event", id);
    });
}
