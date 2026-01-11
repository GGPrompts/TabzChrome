/**
 * Simple test script to verify spawning functionality
 */

const terminalRegistry = require('./modules/terminal-registry');
const unifiedSpawn = require('./modules/unified-spawn');
const os = require('os');

// Use home directory as default working dir for tests
const TEST_WORKING_DIR = process.env.TEST_WORKING_DIR || os.homedir();

async function testSpawn() {
  console.log('=== Tabz Spawn Test ===');
  console.log(`Using working directory: ${TEST_WORKING_DIR}`);

  try {
    // Test 1: Spawn a bash terminal (PTY)
    console.log('\n1. Testing bash terminal spawn (PTY)...');
    const bashResult = await unifiedSpawn.spawn({
      terminalType: 'bash',
      platform: 'local',
      workingDir: TEST_WORKING_DIR
    });

    if (bashResult.success) {
      console.log('✅ Bash terminal spawned:', {
        id: bashResult.terminal.id,
        name: bashResult.terminal.name,
        type: bashResult.terminal.terminalType,
        platform: bashResult.terminal.platform
      });
    } else {
      console.error('❌ Failed to spawn bash terminal:', bashResult.error);
    }

    // Test 2: Try to spawn a Claude terminal
    console.log('\n2. Testing claude-code terminal spawn...');
    const claudeResult = await unifiedSpawn.spawn({
      terminalType: 'claude-code',
      platform: 'local', // All terminals run locally now
      workingDir: TEST_WORKING_DIR
    });

    if (claudeResult.success) {
      console.log('✅ Claude terminal spawned:', {
        id: claudeResult.terminal.id,
        name: claudeResult.terminal.name,
        type: claudeResult.terminal.terminalType,
        platform: claudeResult.terminal.platform
      });
    } else {
      console.error('❌ Failed to spawn Claude terminal:', claudeResult.error);
    }

    // Test 3: List all terminals
    console.log('\n3. Listing all terminals...');
    const allTerminals = terminalRegistry.getAllTerminals();
    console.log(`✅ Found ${allTerminals.length} terminals:`, allTerminals.map(t => ({
      name: t.name,
      type: t.terminalType,
      state: t.state
    })));

    // Test 4: Send a command
    console.log('\n4. Testing command sending...');
    if (bashResult.success) {
      terminalRegistry.sendCommand(bashResult.terminal.id, 'echo "Hello from Tabz"\n');
      console.log('✅ Command sent to bash terminal');
    }

    // Test 5: Get stats
    console.log('\n5. Registry statistics...');
    const stats = terminalRegistry.getStats();
    console.log('✅ Stats:', stats);

    // Wait a bit for output
    console.log('\n6. Waiting 3 seconds for output...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 6: Cleanup
    console.log('\n7. Cleaning up...');
    await terminalRegistry.cleanup();
    console.log('✅ Cleanup complete');
    
    console.log('\n=== Test Complete ===');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle output events
terminalRegistry.on('output', (terminalId, data) => {
  console.log(`📤 Output from ${terminalId}: ${data.toString().trim()}`);
});

terminalRegistry.on('closed', (terminalId) => {
  console.log(`🔴 Terminal ${terminalId} closed`);
});

terminalRegistry.on('error', (terminalId, error) => {
  console.error(`❌ Error from ${terminalId}:`, error);
});

// Run the test
testSpawn();