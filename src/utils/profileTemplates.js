export const PROFILE_BOOT_SECTION = (type, name, serverHost, serverPort, xiloaderPath, hairpin, loginUser, loginPass) => {
  if (type === 'retail') {
    return `[ashita.launcher]
autoclose    = 1
name         = ${name}

[ashita.boot]
file         =
command      = /game eAZcFcB
gamemodule   = ffximain.dll
script       = default.txt
args         =`;
  }
  const xiloaderExe = xiloaderPath ? xiloaderPath.replace(/\//g, '\\\\') + '\\\\xiloader.exe' : '.\\\\xiloader\\\\xiloader.exe';
  const args = ['--server', serverHost || '127.0.0.1'];
  if (serverPort) args.push('--port', serverPort);
  if (loginUser) args.push('--user', loginUser);
  if (loginPass) args.push('--pass', loginPass);
  if (hairpin) args.push('--hairpin');
  return `[ashita.launcher]
autoclose    = 1
name         = ${name}

[ashita.boot]
file         = ${xiloaderExe}
command      = ${args.join(' ')}
gamemodule   = ffximain.dll
script       = default.txt
args         =`;
};

export const DEFAULT_PROFILE_INI = (name, type, serverHost, serverPort, xiloaderPath, hairpin, loginUser, loginPass) => `${PROFILE_BOOT_SECTION(type, name, serverHost, serverPort, xiloaderPath, hairpin, loginUser, loginPass)}

[ashita.fonts]
d3d8.disable_scaling = 0
d3d8.family  = Arial
d3d8.height  = 10

[ashita.input]
gamepad.allowbackground       = 0
gamepad.disableenumeration    = 0
keyboard.blockinput           = 0
keyboard.blockbindsduringinput = 1
keyboard.silentbinds          = 0
keyboard.windowskeyenabled    = 0
mouse.blockinput              = 0
mouse.unhook                  = 1

[ashita.language]
playonline   = 2
ashita       = 2

[ashita.logging]
level        = 5
crashdumps   = 1

[ashita.misc]
addons.silent  = 0
aliases.silent = 0
plugins.silent = 0

[ashita.addons]

[ashita.polplugins]

[ashita.polplugins.args]

[ashita.resources]
offsets.use_overrides   = 1
pointers.use_overrides  = 1
resources.use_overrides = 1

[ashita.taskpool]
threadcount  = -1

[ashita.window.startpos]
x            = -1
y            = -1

[ffxi.registry]
`;
