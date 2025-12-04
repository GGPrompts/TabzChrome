#!/usr/bin/env node

/**
 * Add Dev Logs profile to localStorage
 * Run this script to add the new profile without clearing existing profiles
 */

const profileToAdd = {
  id: `profile-devlogs-${Date.now()}`,
  name: "Dev Logs",
  command: "lnav logs/backend.log logs/frontend.log",
  terminalType: "bash",
  workingDir: "~/projects/Tabz",
  theme: "monokai",
  transparency: 95,
  icon: "🔍",
  description: "Terminal Tabs development logs (backend + frontend)",
  isDefault: false,
};

console.log('\n🔧 Dev Logs Profile Adder\n');
console.log('This will add the "Dev Logs" profile to your Terminal Tabs.');
console.log('\n📝 Profile Details:');
console.log(`   Name: ${profileToAdd.name}`);
console.log(`   Icon: ${profileToAdd.icon}`);
console.log(`   Command: ${profileToAdd.command}`);
console.log(`   Working Dir: ${profileToAdd.workingDir}`);
console.log('\n⚠️  Important:');
console.log('   1. Make sure Terminal Tabs is NOT running');
console.log('   2. Run this in the browser console at http://localhost:5173');
console.log('   3. Or manually add via Settings UI (🎨 button)');
console.log('\n📋 Browser Console Command:\n');

const code = `
// Add Dev Logs profile
const profile = ${JSON.stringify(profileToAdd, null, 2)};
const storage = localStorage.getItem('profiles-storage');
const data = storage ? JSON.parse(storage) : { state: { profiles: [] } };
data.state.profiles.push(profile);
localStorage.setItem('profiles-storage', JSON.stringify(data));
console.log('✅ Dev Logs profile added! Refresh the page.');
`.trim();

console.log('─'.repeat(70));
console.log(code);
console.log('─'.repeat(70));

console.log('\n✨ Or just use the Settings UI:');
console.log('   1. Start Terminal Tabs');
console.log('   2. Click 🎨 button in footer');
console.log('   3. Click "+ New Profile"');
console.log('   4. Fill in the form with the details above');
console.log('');
