const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Code signing & notarization — configured via environment variables.
// See README.md "Building for Distribution" for setup instructions.
const appleIdentity = process.env.APPLE_IDENTITY;
const appleKeychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;
const shouldSign = !!appleIdentity;
const shouldNotarize = shouldSign && !!appleKeychainProfile;

module.exports = {
  packagerConfig: {
    name: 'STYPE to FBX',
    executableName: 'stype-to-fbx',
    icon: './resources/icon',
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
        setupIcon: './resources/icon.ico',
      },
    },
  ],

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
