const path = require('path');
const { execFileSync } = require('child_process');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Code signing & notarization — configured via environment variables.
// See README.md "Building for Distribution" for setup instructions.
const appleIdentity = process.env.APPLE_IDENTITY;
const appleKeychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;
const shouldSign = !!appleIdentity;
const shouldNotarize = shouldSign && !!appleKeychainProfile;

const iconIco = path.resolve('./resources/icon.ico');

module.exports = {
  packagerConfig: {
    name: 'STYPE to FBX',
    executableName: 'stype-to-fbx',
    icon: './resources/icon',
    extraResource: ['./resources/icon.ico', './resources/icon.png'],
    appBundleId: 'studio.tokio.stype-to-fbx',
    appCategoryType: 'public.app-category.developer-tools',
    darwinDarkModeSupport: true,
    ...(shouldSign && {
      osxSign: {
        identity: appleIdentity,
        optionsForFile: () => ({
          entitlements: './resources/entitlements.plist',
          'entitlements-inherit': './resources/entitlements.plist',
        }),
      },
    }),
    ...(shouldNotarize && {
      osxNotarize: {
        keychainProfile: appleKeychainProfile,
      },
    }),
  },

  rebuildConfig: {},

  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: './resources/icon.icns',
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'stype-to-fbx',
        setupIcon: iconIco,
        // electron-winstaller defaults iconUrl to the Electron logo — override
        // with a file:// URI so Squirrel writes our icon into app.ico.
        iconUrl: 'file:///' + iconIco.replace(/\\/g, '/'),
      },
    },
  ],

  hooks: {
    // After Squirrel make, patch the stub exe inside the nupkg and the Setup.exe
    // so the installed shortcut and taskbar show our icon instead of Electron's.
    postMake: async (_config, makeResults) => {
      for (const result of makeResults) {
        if (result.platform !== 'win32') continue;

        const rcedit = path.join(
          __dirname,
          'node_modules/electron-winstaller/vendor/rcedit.exe',
        );

        for (const artifact of result.artifacts) {
          // Patch the Setup.exe — Squirrel's --setupIcon should do this,
          // but as a safety net we also do it here.
          if (artifact.endsWith('Setup.exe')) {
            try {
              execFileSync(rcedit, [artifact, '--set-icon', iconIco]);
              console.log(`  [postMake] Set icon on ${path.basename(artifact)}`);
            } catch (e) {
              console.warn(`  [postMake] Failed to set icon on Setup.exe: ${e.message}`);
            }
          }

          // Patch the stub inside the nupkg.
          // The nupkg is a zip; the stub is *_ExecutionStub.exe.
          if (artifact.endsWith('.nupkg')) {
            try {
              const AdmZip = require('adm-zip');
              const zip = new AdmZip(artifact);
              const entries = zip.getEntries();
              for (const entry of entries) {
                if (entry.entryName.endsWith('_ExecutionStub.exe')) {
                  // Extract stub, patch icon, re-add
                  const tmpStub = path.join(path.dirname(artifact), '_stub_tmp.exe');
                  require('fs').writeFileSync(tmpStub, entry.getData());
                  execFileSync(rcedit, [tmpStub, '--set-icon', iconIco]);
                  zip.updateFile(entry.entryName, require('fs').readFileSync(tmpStub));
                  zip.writeZip(artifact);
                  require('fs').unlinkSync(tmpStub);
                  console.log(`  [postMake] Patched stub icon in ${path.basename(artifact)}`);
                  break;
                }
              }
            } catch (e) {
              console.warn(`  [postMake] Failed to patch nupkg stub: ${e.message}`);
            }
          }
        }
      }
    },
  },

  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};
