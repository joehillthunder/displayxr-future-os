// Layout data: module library, preset layouts, and the vocabularies the builder offers.

const DEVICES = {it:'IT workstation', auto:'Car dashboard', mobile:'Phone'};
const PAL_KEYS = [['bg','Background'],['surface','Surface'],['fg','Text'],['accent','Accent'],['accent2','Accent 2'],['muted','Muted']];
const FONTS = {
  condensed:["Condensed (Antonio)","'Antonio','Arial Narrow',sans-serif"],
  mono:["Mono (Plex Mono)","'IBM Plex Mono',ui-monospace,monospace"],
  sans:["Sans (Plex Sans)","'IBM Plex Sans',system-ui,sans-serif"],
  serif:["Serif (Fraunces)","'Fraunces',Georgia,serif"],
  wide:["Wide (Unbounded)","'Unbounded','Arial Black',sans-serif"]
};
const INPUTS = {touch:'Touch', gesture:'Hand gesture', voice:'Voice', gaze:'Eye gaze', keyboard:'Keyboard', wheel:'Rotary knob'};
const ARCH = {
  bands:{label:'Bands', hint:'Color-coded slabs frame an open content area, like a starship console.'},
  arc:{label:'Spatial arc', hint:'Windows sit on a curve around you. The center one is in focus.'},
  radial:{label:'Radial wheel', hint:'Up to 8 slices around a center readout. Works with flicks or a rotary knob.'},
  tiling:{label:'Tiling grid', hint:'Panes never overlap. One status bar is the only chrome.'},
  holo:{label:'Floating glass', hint:'Translucent cards hang at different depths.'},
  ambient:{label:'Ambient voice', hint:'One spoken sentence and three quiet chips.'},
  cyber:{label:'Data city', hint:'Modules become glowing towers. Height shows load.'},
  tactical:{label:'Tactical display', hint:'A central situation map, fixed readouts and an alert strip.'},
  stream:{label:'Lifestream', hint:'Everything on one timeline, split at now.'},
  orbit:{label:'Agent orbit', hint:'Tasks circle an agent core and show live progress.'}
};

const LIB = {
  it:{
    terminal:{l:'Terminal',k:'term',v:'$ kubectl get pods\n api-7f9   Running\n web-2c1   Running\n jobs-9a   Pending',s:'cluster prod-east',p:.62},
    tickets:{l:'Tickets',k:'num',v:'14',s:'3 P1 · 11 queued',p:.35},
    network:{l:'Network',k:'spark',v:'2.4 Gb/s',s:'core-sw-01',p:.71,sp:[3,5,4,6,8,7,9,6,7,10,8,9]},
    deploys:{l:'Deploys',k:'bar',v:'v4.12',s:'rolling · 3 of 5 nodes',p:.6},
    alerts:{l:'Alerts',k:'num',v:'2',s:'disk space · cert expiry',p:.2},
    mail:{l:'Mail',k:'num',v:'23',s:'unread · 4 flagged',p:.4},
    calendar:{l:'Calendar',k:'text',v:'14:00 Standup',s:'change review 15:30',p:.5},
    docs:{l:'Docs',k:'text',v:'Runbook: failover',s:'edited 12 min ago',p:.3},
    vpn:{l:'VPN',k:'text',v:'Connected',s:'wg0 · 18 ms',p:.9},
    logs:{l:'Logs',k:'spark',v:'1.2k/min',s:'4 errors this hour',p:.55,sp:[6,6,7,5,9,12,8,7,6,7,6,5]}
  },
  auto:{
    speed:{l:'Speed',k:'num',v:'64',s:'mph · limit 65',p:.64},
    nav:{l:'Navigation',k:'text',v:'Left in 0.4 mi',s:'Harbor Ave · ETA 6:10',p:.8},
    media:{l:'Media',k:'bar',v:'Night Drive',s:'2:14 / 4:02',p:.55},
    climate:{l:'Climate',k:'num',v:'70°',s:'auto · fan 2',p:.5},
    battery:{l:'Battery',k:'bar',v:'78%',s:'212 mi range',p:.78},
    adas:{l:'Driver assist',k:'text',v:'Lane keep on',s:'follow distance 3',p:.9},
    phone:{l:'Phone',k:'text',v:'2 missed',s:'press wheel to call back',p:.3},
    cameras:{l:'Cameras',k:'text',v:'All clear',s:'360° view ready',p:1},
    seats:{l:'Seats',k:'text',v:'Heat 2',s:'driver profile A',p:.4},
    trip:{l:'Trip',k:'spark',v:'3.8 mi/kWh',s:'last 40 mi',p:.66,sp:[4,5,5,6,4,5,7,6,6,7,8,7]}
  },
  mobile:{
    messages:{l:'Messages',k:'num',v:'3',s:'new from 2 people',p:.3},
    camera:{l:'Camera',k:'text',v:'Ready',s:'last shot 2 h ago',p:.5},
    wallet:{l:'Wallet',k:'num',v:'$1,284',s:'card ending 4417',p:.6},
    health:{l:'Health',k:'bar',v:'7,420',s:'steps · goal 10k',p:.74},
    maps:{l:'Maps',k:'text',v:'12 min home',s:'light traffic',p:.7},
    music:{l:'Music',k:'bar',v:'Lo-fi mix',s:'1:02 / 3:30',p:.3},
    photos:{l:'Photos',k:'num',v:'128',s:'new memories',p:.45},
    weather:{l:'Weather',k:'spark',v:'61°',s:'clouds, rain at 6',p:.6,sp:[61,62,63,63,62,60,58,57,57,56,55,55]},
    calls:{l:'Calls',k:'num',v:'1',s:'missed · voicemail',p:.1},
    home:{l:'Home',k:'bar',v:'Lights 40%',s:'front door locked',p:.4}
  }
};
const STAMP = {it:'09:41 · ops-ws-07', auto:'D · 64 mph', mobile:'9:41'};
const LINES = {it:'Two alerts overnight, both resolved. Standup is at two.', auto:'Traffic is light. You will be home by 6:10.', mobile:'Three new messages. Rain starts around six.'};
const ORBIT = {it:'Patching three servers', auto:'Routing around a closure', mobile:'Booking dinner for eight'};
const ALERT = {it:'Disk 92% on db-03', auto:'Cyclist approaching on the right', mobile:'Battery 12% · low power on'};

const PRESETS = [
  {id:'bridge', name:'Bridge Panel', tagline:'A color-banded starship console where every function is a labeled slab.', archetype:'bands', font:'condensed', radius:1, density:'dense', motion:false,
   palette:{bg:'#000000',surface:'#14101c',fg:'#ffd6ad',accent:'#ff9c3a',accent2:'#cc99cc',muted:'#8f93ff'}, inputs:['touch','voice'],
   sources:[{t:'TV',n:'Star Trek: The Next Generation, LCARS interface by Michael Okuda'},{t:'Reddit',n:'r/unixporn and r/startrek LCARS desktop themes'}],
   principles:['Color bands group functions; there is no window chrome','Every control is a big labeled target you can hit at a glance','Status lives in the frame and content sits in the open space'],
   modules:{it:['alerts','network','tickets','deploys','logs','vpn'],auto:['speed','battery','nav','climate','adas','media'],mobile:['messages','health','weather','maps','wallet','music']}},
  {id:'horizon', name:'Horizon Arc', tagline:'Windows on a curved shelf around you, the way headset users arrange virtual monitors.', archetype:'arc', font:'sans', radius:4, density:'calm', motion:true,
   palette:{bg:'#0e1a22',surface:'#1d3341',fg:'#e8f5ff',accent:'#7fd4ff',accent2:'#ffd18a',muted:'#86a0b1'}, inputs:['gaze','gesture','keyboard'],
   sources:[{t:'Reddit',n:'r/VisionPro and r/virtualreality threads on curved multi-window workspaces'},{t:'Reddit',n:'r/OculusQuest posts from Immersed and Virtual Desktop users'},{t:'Novel',n:'Snow Crash (Neal Stephenson), the Street as a shared spatial plane'}],
   principles:['Windows sit on a curve at equal distance from your eyes','Look at a window to focus it; its neighbors dim and recede','A fixed horizon line keeps long sessions comfortable'],
   modules:{it:['terminal','docs','mail','calendar','logs'],auto:['media','nav','speed','battery','climate'],mobile:['messages','maps','music','photos','weather']}},
  {id:'pie', name:'Pie Wheel', tagline:'A radial menu you flick instead of aim. The same wheel works on a wrist, a thumb ring or a car knob.', archetype:'radial', font:'wide', radius:2, density:'dense', motion:false,
   palette:{bg:'#15110d',surface:'#2c241b',fg:'#f6ecdf',accent:'#ffb000',accent2:'#ff5f3a',muted:'#a39280'}, inputs:['gesture','wheel','touch'],
   sources:[{t:'Reddit',n:'r/OculusQuest discussion of hand-tracking menus and wrist pop-ups'},{t:'Forum',n:'Blender and game-dev forums on pie menus and Fitts’s law'},{t:'Game',n:'Mass Effect dialogue wheel'}],
   principles:['Eight directions at most, so the menu runs on muscle memory','Flick toward a slice and let go; no precise aiming','One wheel for knob, thumb ring and wrist'],
   modules:{it:['tickets','terminal','mail','calendar','docs','vpn','alerts','logs'],auto:['speed','media','nav','climate','phone','seats','cameras','battery'],mobile:['messages','camera','music','maps','calls','wallet','home','photos']}},
  {id:'tiler', name:'Tiler', tagline:'Keyboard-first tiling where windows never overlap and nothing hides.', archetype:'tiling', font:'mono', radius:0, density:'dense', motion:false,
   palette:{bg:'#0f1218',surface:'#161b24',fg:'#cdd6f4',accent:'#a6e3a1',accent2:'#89b4fa',muted:'#6c7489'}, inputs:['keyboard'],
   sources:[{t:'Reddit',n:'r/unixporn setups built on i3, sway and Hyprland'},{t:'Forum',n:'Hacker News threads on keyboard-first workflows'},{t:'Reddit',n:'r/sysadmin wish lists for ops consoles'}],
   principles:['Windows never overlap; the whole screen is always in use','Every pane is one keystroke away','The status bar is the only chrome'],
   modules:{it:['terminal','logs','tickets','network','deploys'],auto:['nav','speed','battery','media','trip'],mobile:['messages','maps','weather','music','health']}},
  {id:'precog', name:'Precog Glass', tagline:'Floating holographic cards you grab, fling and call by name.', archetype:'holo', font:'sans', radius:1, density:'balanced', motion:true,
   palette:{bg:'#03111a',surface:'#0a2230',fg:'#d9fbff',accent:'#3cf4ff',accent2:'#ff7ad9',muted:'#6aa4b2'}, inputs:['gesture','voice','gaze'],
   sources:[{t:'Film',n:'Minority Report, gesture UI developed with John Underkoffler'},{t:'Film',n:'Iron Man, the JARVIS workshop holograms'},{t:'Reddit',n:'r/virtualreality debates about gorilla-arm fatigue'}],
   principles:['Content floats in depth layers you grab and fling','Voice names things; hands move them','Built for short bursts, so arms rest between gestures'],
   modules:{it:['network','deploys','tickets','logs','alerts','docs'],auto:['nav','cameras','speed','adas','battery'],mobile:['maps','photos','messages','health','weather']}},
  {id:'samantha', name:'Samantha', tagline:'A voice-first OS with almost no screen. It speaks one sentence and waits.', archetype:'ambient', font:'serif', radius:6, density:'calm', motion:true,
   palette:{bg:'#f4d6c6',surface:'#efc2ab',fg:'#3a1a14',accent:'#d2452b',accent2:'#8a2a1c',muted:'#94523f'}, inputs:['voice'],
   sources:[{t:'Film',n:'Her (2013), a conversational OS with a minimal screen'},{t:'Forum',n:'Calm Technology principles (Amber Case) on UX forums'},{t:'Reddit',n:'r/productivity threads on notification fatigue'}],
   principles:['One sentence at a time','Voice leads and the screen confirms','Interrupt for people, never for apps'],
   modules:{it:['calendar','alerts','mail'],auto:['nav','media','phone'],mobile:['messages','weather','calls']}},
  {id:'sprawl', name:'Sprawl', tagline:'Cyberspace as a lit city. Systems are towers and load is height.', archetype:'cyber', font:'wide', radius:0, density:'balanced', motion:true,
   palette:{bg:'#06020f',surface:'#160a2a',fg:'#efe6ff',accent:'#ff2bd6',accent2:'#2bf0ff',muted:'#9a84c8'}, inputs:['gaze','gesture'],
   sources:[{t:'Novel',n:'Neuromancer (William Gibson), cyberspace as a glowing grid'},{t:'Novel',n:'Snow Crash (Neal Stephenson), the Metaverse'},{t:'Reddit',n:'r/cyberpunk and r/VRchat world builders'}],
   principles:['Data is geography: the tallest towers carry the most load','You move by flying toward things, not by opening menus','Glow means live; dark means idle'],
   modules:{it:['network','logs','deploys','tickets','alerts','vpn'],auto:['nav','battery','trip','speed','cameras'],mobile:['maps','wallet','health','photos','messages']}},
  {id:'rocinante', name:'Rocinante', tagline:'A ship console with one situation display and readouts that never move.', archetype:'tactical', font:'mono', radius:0, density:'dense', motion:true,
   palette:{bg:'#091017',surface:'#0f1c26',fg:'#d4ebf5',accent:'#5ad1ff',accent2:'#ff6b5a',muted:'#56717f'}, inputs:['touch','keyboard'],
   sources:[{t:'Novel',n:'The Expanse (James S. A. Corey), ship consoles and hand terminals'},{t:'Reddit',n:'r/TheExpanse UI breakdowns'},{t:'Reddit',n:'r/flightsim threads on glass-cockpit displays'}],
   principles:['One central situation display; everything else is peripheral','Readouts never move, so the eye learns where to look','Alerts escalate by color and position, never by popup'],
   modules:{it:['alerts','network','vpn','tickets','deploys','logs'],auto:['speed','battery','adas','cameras','nav','climate'],mobile:['health','maps','weather','messages','calls','wallet']}},
  {id:'chronicle', name:'Chronicle', tagline:'No files or apps, just one timeline of everything, split at now.', archetype:'stream', font:'sans', radius:3, density:'balanced', motion:false,
   palette:{bg:'#eef1f5',surface:'#ffffff',fg:'#141a26',accent:'#2f5bea',accent2:'#d9552a',muted:'#6e7889'}, inputs:['touch','voice','keyboard'],
   sources:[{t:'Research',n:'Lifestreams (Eric Freeman and David Gelernter, Yale, 1990s)'},{t:'Reddit',n:'r/PKMS and r/ObsidianMD posts on daily-note capture'},{t:'Forum',n:'Hacker News threads arguing that files and folders should go'}],
   principles:['No files or folders, only a timeline','The past is searchable and the future is scheduled','Now is a line you can always scroll back to'],
   modules:{it:['mail','deploys','tickets','docs','calendar','alerts'],auto:['phone','media','nav','trip','battery'],mobile:['messages','photos','calls','wallet','maps','weather']}},
  {id:'mind', name:'Culture Mind', tagline:'You state an intent; agents orbit it and report back for approval.', archetype:'orbit', font:'wide', radius:5, density:'balanced', motion:true,
   palette:{bg:'#0b0b15',surface:'#181830',fg:'#ecebff',accent:'#b69cff',accent2:'#6ef0b0',muted:'#8986b5'}, inputs:['voice','touch','gaze'],
   sources:[{t:'Novel',n:'The Culture novels (Iain M. Banks), ship Minds that act on your behalf'},{t:'Reddit',n:'r/LocalLLaMA and r/AI_Agents threads on agent dashboards'},{t:'Forum',n:'Developer forums on human-in-the-loop approvals'}],
   principles:['You state intent; agents do the steps','Each satellite is a task with live progress','Approve or redirect instead of operating'],
   modules:{it:['deploys','tickets','mail','docs','logs','alerts'],auto:['nav','battery','climate','media','phone'],mobile:['wallet','messages','maps','home','music','calls']}}
];


export { DEVICES, PAL_KEYS, FONTS, INPUTS, ARCH, LIB, STAMP, LINES, ORBIT, ALERT, PRESETS };
