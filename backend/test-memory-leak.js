#!/usr/bin/env node

/**
 * Test script to verify memory leak fixes
 * This script spawns and closes terminals repeatedly to check for memory leaks
 */

const terminalRegistry = require('./modules/terminal-registry');
const ptyHandler = require('./modules/pty-handler');

async function testMemoryLeak() {
  console.log('🧪 Testing memory leak fixes...\n');
  
  // Initial memory snapshot
  const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Initial memory usage: ${initialMemory.toFixed(2)} MB`);
  
  // Test 1: Create and destroy PTY processes
  console.log('\n📝 Test 1: PTY Handler memory leak test');
  for (let i = 0; i < 10; i++) {
    const config = {
      id: `test-${i}`,
      name: `test-terminal-${i}`,
      terminalType: 'bash',
      workingDir: process.cwd()
    };
    
    try {
      // Create PTY
      const ptyInfo = ptyHandler.createPTY(config);
      console.log(`  ✓ Created PTY ${i + 1}/10`);
      
      // Write some data
      ptyHandler.writeData(config.id, 'echo "test"\n');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Kill PTY
      await ptyHandler.killPTY(config.id);
      console.log(`  ✓ Killed PTY ${i + 1}/10`);
    } catch (error) {
      console.error(`  ✗ Error in PTY test ${i + 1}:`, error.message);
    }
  }
  
  // Check for orphaned processes
  const remainingPTYs = ptyHandler.getAllPTYs();
  if (remainingPTYs.length > 0) {
    console.log(`  ⚠️  Warning: ${remainingPTYs.length} PTY processes still active`);
  } else {
    console.log('  ✅ All PTY processes cleaned up successfully');
  }
  
  // Test 2: Check event listener counts
  console.log('\n📝 Test 2: Event listener leak test');
  
  const registryListeners = {
    output: terminalRegistry.listenerCount('output'),
    closed: terminalRegistry.listenerCount('closed'),
    error: terminalRegistry.listenerCount('error')
  };
  
  const ptyListeners = {
    'pty-output': ptyHandler.listenerCount('pty-output'),
    'pty-closed': ptyHandler.listenerCount('pty-closed')
  };
  
  console.log('  Terminal Registry listeners:', registryListeners);
  console.log('  PTY Handler listeners:', ptyListeners);
  
  // Check for excessive listeners (potential leak)
  let hasLeak = false;
  for (const [event, count] of Object.entries(registryListeners)) {
    if (count > 2) {
      console.log(`  ⚠️  Warning: High listener count for '${event}': ${count}`);
      hasLeak = true;
    }
  }
  
  for (const [event, count] of Object.entries(ptyListeners)) {
    if (count > 2) {
      console.log(`  ⚠️  Warning: High listener count for '${event}': ${count}`);
      hasLeak = true;
    }
  }
  
  if (!hasLeak) {
    console.log('  ✅ No event listener leaks detected');
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('\n🔧 Forced garbage collection');
  }
  
  // Final memory check
  await new Promise(resolve => setTimeout(resolve, 1000));
  const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  const memoryIncrease = finalMemory - initialMemory;
  
  console.log(`\n📊 Memory Report:`);
  console.log(`  Initial: ${initialMemory.toFixed(2)} MB`);
  console.log(`  Final: ${finalMemory.toFixed(2)} MB`);
  console.log(`  Increase: ${memoryIncrease.toFixed(2)} MB`);
  
  if (memoryIncrease > 10) {
    console.log(`  ⚠️  Warning: Significant memory increase detected (${memoryIncrease.toFixed(2)} MB)`);
    console.log('  This might indicate a memory leak');
  } else {
    console.log('  ✅ Memory usage is within acceptable range');
  }
  
  console.log('\n✨ Memory leak tests completed!');
  
  // Clean up
  await ptyHandler.cleanup();
  process.exit(0);
}

// Run tests
testMemoryLeak().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});