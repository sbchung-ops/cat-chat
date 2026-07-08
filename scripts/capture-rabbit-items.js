const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const out = path.join(__dirname, '..', '_qa_rabbit_items.png');
const outFold = path.join(__dirname, '..', '_qa_rabbit_items_ears_back.png');

app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  await session.defaultSession.clearCache();
  const win = new BrowserWindow({
    width: 980,
    height: 3400,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
    },
  });

  await win.loadURL(`http://127.0.0.1:3000/rabbit-item-test.html?v=${Date.now()}`);
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const done = () => document.title.includes('Ready');
      if (done()) return resolve();
      const timer = setInterval(() => {
        if (done()) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
      setTimeout(resolve, 3000);
    })
  `);
  await win.webContents.executeJavaScript(`
    Promise.all(Array.from(document.images).map((img) => {
      if (img.complete && img.naturalWidth > 0) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', () => {
          if (img.decode) img.decode().catch(() => {}).then(resolve);
          else resolve();
        }, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 2000);
      });
    }))
  `);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await win.webContents.executeJavaScript('window.scrollTo(0, 0)');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await win.capturePage();
  require('fs').writeFileSync(out, image.toPNG());
  await win.webContents.executeJavaScript(`
    const earsBack = Array.from(document.querySelectorAll('h2')).find((h) => h.textContent.includes('Ears back'));
    window.scrollTo(0, Math.max(0, (earsBack ? earsBack.offsetTop : 0) - 18));
  `);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const foldImage = await win.capturePage();
  require('fs').writeFileSync(outFold, foldImage.toPNG());
  app.quit();
});
