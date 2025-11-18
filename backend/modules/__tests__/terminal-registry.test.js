const terminalRegistry = require('../terminal-registry');

describe('Terminal Registry', () => {
  beforeEach(() => {
    // Clear all terminals before each test
    terminalRegistry.terminals.clear();
    terminalRegistry.nameCounters.clear();
  });

  describe('registerTerminal', () => {
    it('should register a new terminal', async () => {
      const config = {
        terminalType: 'bash',
        platform: 'local',
      };

      const terminal = await terminalRegistry.registerTerminal(config);

      expect(terminal).toBeDefined();
      expect(terminal.id).toBeDefined();
      expect(terminal.name).toMatch(/^bash-\d+$/);
      expect(terminal.terminalType).toBe('bash');
      expect(terminal.platform).toBe('local');
    });

    it('should use provided name if given', async () => {
      const config = {
        name: 'Custom Terminal',
        terminalType: 'bash',
        platform: 'local',
      };

      const terminal = await terminalRegistry.registerTerminal(config);

      expect(terminal.name).toBe('Custom Terminal');
    });

    it('should generate sequential names by type', async () => {
      const config1 = { terminalType: 'bash', platform: 'local' };
      const config2 = { terminalType: 'bash', platform: 'local' };
      const config3 = { terminalType: 'claude-code', platform: 'local' };

      const terminal1 = await terminalRegistry.registerTerminal(config1);
      const terminal2 = await terminalRegistry.registerTerminal(config2);
      const terminal3 = await terminalRegistry.registerTerminal(config3);

      expect(terminal1.name).toBe('bash-1');
      expect(terminal2.name).toBe('bash-2');
      expect(terminal3.name).toBe('claude-code-1');
    });
  });

  describe('getTerminal', () => {
    it('should return undefined for non-existent terminal', () => {
      const terminal = terminalRegistry.getTerminal('non-existent');
      expect(terminal).toBeUndefined();
    });

    it('should return registered terminal', async () => {
      const config = {
        terminalType: 'bash',
        platform: 'local',
      };

      const registered = await terminalRegistry.registerTerminal(config);
      const terminal = terminalRegistry.getTerminal(registered.id);

      expect(terminal).toBeDefined();
      expect(terminal.id).toBe(registered.id);
    });
  });

  describe('getAllTerminals', () => {
    it('should return empty array when no terminals', () => {
      const terminals = terminalRegistry.getAllTerminals();
      expect(terminals).toEqual([]);
    });

    it('should return all registered terminals', async () => {
      await terminalRegistry.registerTerminal({ terminalType: 'bash' });
      await terminalRegistry.registerTerminal({ terminalType: 'claude-code' });
      await terminalRegistry.registerTerminal({ terminalType: 'opencode' });

      const terminals = terminalRegistry.getAllTerminals();
      expect(terminals).toHaveLength(3);
      expect(terminals[0].terminalType).toBe('bash');
      expect(terminals[1].terminalType).toBe('claude-code');
      expect(terminals[2].terminalType).toBe('opencode');
    });
  });

  describe('updateTerminal', () => {
    it('should update existing terminal', async () => {
      const registered = await terminalRegistry.registerTerminal({
        terminalType: 'bash',
        platform: 'local',
      });

      const updated = terminalRegistry.updateTerminal(registered.id, {
        name: 'Updated Name',
        status: 'offline',
      });

      expect(updated).toBe(true);

      const terminal = terminalRegistry.getTerminal(registered.id);
      expect(terminal.name).toBe('Updated Name');
      expect(terminal.status).toBe('offline');
    });

    it('should return false when updating non-existent terminal', () => {
      const updated = terminalRegistry.updateTerminal('non-existent', {
        name: 'New Name',
      });

      expect(updated).toBe(false);
    });
  });

  describe('removeTerminal', () => {
    it('should remove existing terminal', async () => {
      const registered = await terminalRegistry.registerTerminal({
        terminalType: 'bash',
      });

      const removed = terminalRegistry.removeTerminal(registered.id);
      expect(removed).toBe(true);

      const terminal = terminalRegistry.getTerminal(registered.id);
      expect(terminal).toBeUndefined();
    });

    it('should return false when removing non-existent terminal', () => {
      const removed = terminalRegistry.removeTerminal('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getActiveTerminals', () => {
    it('should return only active terminals', async () => {
      const active1 = await terminalRegistry.registerTerminal({ terminalType: 'bash' });
      const offline1 = await terminalRegistry.registerTerminal({ terminalType: 'bash' });
      const active2 = await terminalRegistry.registerTerminal({ terminalType: 'claude-code' });

      // Update one terminal to be offline
      terminalRegistry.updateTerminal(offline1.id, { status: 'offline' });

      const activeTerminals = terminalRegistry.getActiveTerminals();
      expect(activeTerminals).toHaveLength(2);
      expect(activeTerminals.map(t => t.id)).toContain(active1.id);
      expect(activeTerminals.map(t => t.id)).toContain(active2.id);
    });
  });
});