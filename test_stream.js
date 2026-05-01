const fs = require('fs');

async function test() {
  const chunk1 = 'data: {"chunk":"{\\""}\n\n';
  const chunk2 = 'data: {"done":true,"score":60,"fullReply":"test","options":["A","B","C"]}\n\n';

  let buffer = '';
  
  function processChunk(chunk) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.substring(6);
        try {
          const data = JSON.parse(dataStr);
          console.log("Parsed:", data);
        } catch(e) {
          console.error("Parse error:", dataStr, e.message);
        }
      }
    }
  }

  processChunk(chunk1);
  processChunk(chunk2);
}
test();
