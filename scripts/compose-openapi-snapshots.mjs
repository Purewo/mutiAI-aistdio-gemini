import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [baseRepo, baseRevision, channelRepo, channelRevision, mixedRepo, mixedRevision, output] = process.argv.slice(2);

function readRevision(repo, revision) {
  return JSON.parse(execFileSync('git', ['-C', repo, 'show', `${revision}:contracts/openapi/openapi.v1.json`], { encoding: 'utf8' }));
}

const base = readRevision(baseRepo, baseRevision);
const channel = readRevision(channelRepo, channelRevision);
const mixed = readRevision(mixedRepo, mixedRevision);

for (const [name, value] of Object.entries(channel.paths)) {
  if (!(name in base.paths)) base.paths[name] = value;
}
for (const [name, value] of Object.entries(channel.components.schemas)) {
  if (!(name in base.components.schemas) || name === 'AssistantConversationResponse') {
    base.components.schemas[name] = value;
  }
}
for (const [name, value] of Object.entries(mixed.paths)) {
  if (!(name in base.paths)) base.paths[name] = value;
}
for (const [name, value] of Object.entries(mixed.components.schemas)) {
  if (!(name in base.components.schemas)) base.components.schemas[name] = value;
}

writeFileSync(output, `${JSON.stringify(base, null, 2)}\n`, 'utf8');
