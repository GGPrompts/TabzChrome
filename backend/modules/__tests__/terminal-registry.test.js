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
      expect(terminal.name).toBe('bash'); // First terminal gets no suffix
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

    it('should generate sequential names for duplicates', async () => {
      const config1 = { terminalType: 'bash', platform: 'local' };
      const config2 = { terminalType: 'bash', platform: 'local' };
      const config3 = { terminalType: 'claude-code', platform: 'local' };

      const terminal1 = await terminalRegistry.registerTerminal(config1);
      const terminal2 = await terminalRegistry.registerTerminal(config2);
      const terminal3 = await terminalRegistry.registerTerminal(config3);

      expect(terminal1.name).toBe('bash'); // First gets no suffix
      expect(terminal2.name).toBe('bash-2'); // Second gets -2
      expect(terminal3.name).toBe('claude-code'); // Different type, no suffix
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

  describe('closeTerminal', () => {
    it('should close existing terminal', async () => {
      const registered = await terminalRegistry.registerTerminal({
        terminalType: 'bash',
      });

      const result = await terminalRegistry.closeTerminal(registered.id);
      expect(result).toBe(true);

      const terminal = terminalRegistry.getTerminal(registered.id);
      expect(terminal).toBeUndefined();
    });

    it('should return true when closing non-existent terminal (idempotent)', async () => {
      const result = await terminalRegistry.closeTerminal('non-existent');
      expect(result).toBe(true);
    });
  });

  describe('getActiveTerminalCount', () => {
    it('should return count of active terminals', async () => {
      await terminalRegistry.registerTerminal({ terminalType: 'bash' });
      await terminalRegistry.registerTerminal({ terminalType: 'bash' });
      await terminalRegistry.registerTerminal({ terminalType: 'claude-code' });

      const count = terminalRegistry.getActiveTerminalCount();
      expect(count).toBe(3);
    });

    it('should return 0 when no terminals', () => {
      const count = terminalRegistry.getActiveTerminalCount();
      expect(count).toBe(0);
    });
  });
});