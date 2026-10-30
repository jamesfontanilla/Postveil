const fs = require('fs');
const path = 'C:\\Users\\Jaime\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Preferences';

try {
  const content = fs.readFileSync(path, 'utf8');
  const prefs = JSON.parse(content);

  if (!prefs.profile) prefs.profile = {};
  if (!prefs.profile.content_settings) prefs.profile.content_settings = {};
  if (!prefs.profile.content_settings.exceptions) prefs.profile.content_settings.exceptions = {};

  const exceptions = prefs.profile.content_settings.exceptions;

  // Ensure media_stream_camera and media_stream_mic exceptions allow https://meet.postveil.me
  const targetPattern = 'https://meet.postveil.me:443,*';
  const targetPatternWildcard = 'https://[*.]postveil.me:443,*';
  const targetPatternSimple = 'https://meet.postveil.me,*';

  const settingAllow = {
    expiration: "0",
    last_modified: Date.now().toString(),
    model: 0,
    setting: 1 // 1 is ALLOW in Chrome content settings (2 is BLOCK, 0 or default is ASK)
  };

  const keys = ['media_stream_camera', 'media_stream_mic'];
  for (const key of keys) {
    if (!exceptions[key]) exceptions[key] = {};
    exceptions[key][targetPattern] = settingAllow;
    exceptions[key][targetPatternWildcard] = settingAllow;
    exceptions[key][targetPatternSimple] = settingAllow;
  }

  fs.writeFileSync(path, JSON.stringify(prefs, null, 2), 'utf8');
  console.log('SUCCESS: Injected Allow setting for https://meet.postveil.me into Chrome Preferences!');
} catch (e) {
  console.error('ERROR:', e);
}
