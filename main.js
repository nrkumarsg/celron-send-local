const { app, BrowserWindow } = require('electron');
const path = require('path');
const { bootServer } = require('./server');

let mainWindow;

async function createWindow() {
    // Pass port 0 so the OS automatically picks an unused, free temporary port
    // ensuring the app never conflicts with other running services.
    const dynamicallyAssignedUrl = await bootServer(0);

    mainWindow = new BrowserWindow({
        width: 1100,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, 'public/logo.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true
    });

    // Load the randomly assigned Localhost Node Server
    mainWindow.loadURL(dynamicallyAssignedUrl);
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
