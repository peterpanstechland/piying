/**
 * macOS Notarization Script
 * 
 * This script handles notarization of macOS builds for Apple Gatekeeper.
 * It runs automatically after signing when building for macOS.
 * 
 * Required environment variables:
 * - APPLE_ID: Your Apple Developer ID email
 * - APPLE_ID_PASSWORD: App-specific password for notarization
 * - APPLE_TEAM_ID: Your Apple Developer Team ID
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build');
    return;
  }

  // Check if notarization credentials are available
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !appleTeamId) {
    console.log('Skipping notarization - credentials not provided');
    console.log('To enable notarization, set these environment variables:');
    console.log('  - APPLE_ID');
    console.log('  - APPLE_ID_PASSWORD');
    console.log('  - APPLE_TEAM_ID');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);

  try {
    await notarize({
      appBundleId: 'com.shadowpuppet.system',
      appPath: appPath,
      appleId: appleId,
      appleIdPassword: appleIdPassword,
      teamId: appleTeamId,
    });
    
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};


