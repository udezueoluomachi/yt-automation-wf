import { renderShortVideo } from '../src/render.js';
import { loadCalendar } from '../src/workflow.js';

async function main() {
  const calendar = loadCalendar();
  const entry = calendar[0]; // VID-001
  console.log(`Rendering short for ${entry.serialId}: ${entry.topic}`);
  const outputPath = await renderShortVideo(entry, (percent) => {
    // progress callback
  });
  console.log(`\n🎉 Render finished successfully! Video saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
