const BRIDGE_URL = 'http://127.0.0.1:10086/command';
const SESSION = 'flow-production';

async function call(action: string, args: Record<string, any> = {}) {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session: SESSION })
  });
  return (await res.json()).data;
}

async function inspect() {
  const tabs = await call('list_browser_tabs');
  const flowTab = tabs.tabs?.slice().reverse().find((t: any) => t.url.includes('flow.google.com') && t.title && t.title.includes('Google Flow'));
  if (!flowTab) {
    console.log('No flow tab found!');
    return;
  }
  await call('attach_tab', { tabId: flowTab.tabId });
  const evalRes = await call('evaluate', {
    code: `(() => {
      const tiles = Array.from(document.querySelectorAll('flow-grid-tile-container'));
      return {
        tileCount: tiles.length,
        topTileText: tiles[0] ? tiles[0].innerText.replace(/\\s+/g, ' ').slice(0, 200) : null,
        topTileHasVideo: tiles[0] ? !!tiles[0].querySelector('video, flow-video-tile') : false,
        topTileHasPlay: tiles[0] ? !!tiles[0].querySelector('[data-icon="play_circle"], [fonticon="play_circle"]') : false,
        tilesSummary: tiles.slice(0, 3).map((t, i) => ({
          i,
          text: (t.innerText || '').replace(/\\s+/g, ' ').slice(0, 80),
          hasVideo: !!t.querySelector('video, flow-video-tile')
        }))
      };
    })()`
  });
  console.log('Top tile status:', JSON.stringify(evalRes.value, null, 2));
}

inspect();
