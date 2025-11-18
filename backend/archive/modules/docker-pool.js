/**
 * Docker Container Pool - Pre-warm containers for faster spawning
 * 
 * Based on orchestrator patterns but simplified for v3:
 * - Pre-warm containers for common terminal types
 * - Automatic pool management and cleanup
 * - Health monitoring
 */

const Docker = require('dockerode');
const EventEmitter = require('events');

class DockerPool extends EventEmitter {
  constructor() {
    super();
    
    // Pool configuration
    this.poolConfig = {
      'claude-code': { min: 1, max: 3, image: 'opustrator-claude:latest' },
      'opencode': { min: 1, max: 3, image: 'opustrator-opencode:latest' },
      'bash': { min: 2, max: 5, image: 'ubuntu:22.04' }
    };
    
    // Pool state: type -> available containers
    this.pools = new Map();
    
    // In-use containers: containerId -> terminalId
    this.inUse = new Map();
    
    // Docker client
    this.docker = null;
    this.poolEnabled = false;
    
    // Pool maintenance interval
    this.maintenanceInterval = null;
    
    this.initPool();
  }

  /**
   * Initialize container pool
   */
  async initPool() {
    try {
      // Check if pooling is enabled via environment
      this.poolEnabled = process.env.ENABLE_CONTAINER_POOL === 'true';
      
      if (!this.poolEnabled) {
        console.log('[DockerPool] Container pooling disabled');
        return;
      }

      this.docker = new Docker();
      await this.docker.ping();
      
      console.log('[DockerPool] Initializing container pools');
      
      // Initialize pools for each type
      for (const [type, config] of Object.entries(this.poolConfig)) {
        this.pools.set(type, []);
        await this.ensureMinContainers(type, config);
      }
      
      // Start maintenance task
      this.startMaintenance();
      
      console.log('[DockerPool] Container pools ready');
      
    } catch (error) {
      // Docker not available - disable pooling gracefully
      console.log('[DockerPool] Docker not available, pooling disabled');
      this.poolEnabled = false;
    }
  }

  /**
   * Ensure minimum containers are available
   */
  async ensureMinContainers(type, config) {
    const pool = this.pools.get(type) || [];
    const needed = config.min - pool.length;
    
    if (needed <= 0) return;
    
    console.log(`[DockerPool] Pre-warming ${needed} ${type} containers`);
    
    const promises = [];
    for (let i = 0; i < needed; i++) {
      promises.push(this.createPooledContainer(type, config));
    }
    
    const containers = await Promise.all(promises);
    this.pools.set(type, [...pool, ...containers.filter(c => c)]);
  }

  /**
   * Create a pooled container
   */
  async createPooledContainer(type, config) {
    try {
      const container = await this.docker.createContainer({
        Image: config.image,
        name: `pool-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        Tty: true,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Env: [
          'TERM=xterm-256color',
          `POOLED_TYPE=${type}`,
          'POOLED=true'
        ],
        HostConfig: {
          Memory: 512 * 1024 * 1024, // 512MB for pooled containers
          CpuQuota: 50000, // 0.5 CPU for pooled
          AutoRemove: true
        },
        Labels: {
          'opustrator.pool': 'true',
          'opustrator.pool.type': type,
          'opustrator.pool.created': new Date().toISOString()
        },
        // Keep container running but idle
        Cmd: ['/bin/sh', '-c', 'while true; do sleep 30; done']
      });

      await container.start();
      
      return {
        id: container.id,
        type,
        container,
        created: Date.now(),
        healthy: true
      };
      
    } catch (error) {
      console.error(`[DockerPool] Failed to create ${type} container:`, error);
      return null;
    }
  }

  /**
   * Acquire a container from the pool
   */
  async acquireContainer(type) {
    if (!this.poolEnabled) {
      return null; // Let docker-manager create on-demand
    }
    
    const pool = this.pools.get(type) || [];
    
    // Find available healthy container
    const available = pool.find(c => c.healthy && !this.inUse.has(c.id));
    
    if (!available) {
      console.log(`[DockerPool] No available ${type} containers in pool`);
      // Could create on-demand here, but for now return null
      return null;
    }
    
    // Mark as in-use
    this.inUse.set(available.id, true);
    
    console.log(`[DockerPool] Acquired ${type} container from pool`);
    
    // Schedule pool replenishment
    setImmediate(() => {
      const config = this.poolConfig[type];
      if (config) {
        this.ensureMinContainers(type, config);
      }
    });
    
    return available.container;
  }

  /**
   * Release container back to pool or remove
   */
  async releaseContainer(containerId, reusable = false) {
    this.inUse.delete(containerId);
    
    if (!reusable) {
      // Remove from pool and destroy
      for (const [type, pool] of this.pools.entries()) {
        const index = pool.findIndex(c => c.id === containerId);
        if (index !== -1) {
          const containerInfo = pool[index];
          pool.splice(index, 1);
          
          try {
            await containerInfo.container.remove({ force: true });
            console.log(`[DockerPool] Removed container from ${type} pool`);
          } catch (error) {
            console.error('[DockerPool] Failed to remove container:', error);
          }
          
          // Replenish pool
          const config = this.poolConfig[type];
          if (config) {
            this.ensureMinContainers(type, config);
          }
          break;
        }
      }
    }
  }

  /**
   * Start maintenance task
   */
  startMaintenance() {
    // Run maintenance every 30 seconds
    this.maintenanceInterval = setInterval(() => {
      this.performMaintenance();
    }, 30000);
  }

  /**
   * Perform pool maintenance
   */
  async performMaintenance() {
    if (!this.poolEnabled) return;
    
    for (const [type, pool] of this.pools.entries()) {
      const config = this.poolConfig[type];
      if (!config) continue;
      
      // Remove unhealthy containers
      const healthy = [];
      for (const containerInfo of pool) {
        if (this.inUse.has(containerInfo.id)) {
          healthy.push(containerInfo);
          continue;
        }
        
        try {
          const container = this.docker.getContainer(containerInfo.id);
          const info = await container.inspect();
          
          if (info.State.Running) {
            // Check age - remove if older than 5 minutes
            const age = Date.now() - containerInfo.created;
            if (age > 5 * 60 * 1000) {
              console.log(`[DockerPool] Recycling old ${type} container`);
              await container.remove({ force: true });
            } else {
              containerInfo.healthy = true;
              healthy.push(containerInfo);
            }
          } else {
            // Remove dead container
            await container.remove({ force: true });
          }
        } catch (error) {
          // Container doesn't exist, skip
        }
      }
      
      this.pools.set(type, healthy);
      
      // Ensure minimum containers
      await this.ensureMinContainers(type, config);
      
      // Remove excess containers
      while (healthy.length > config.max) {
        const excess = healthy.pop();
        if (!this.inUse.has(excess.id)) {
          try {
            await excess.container.remove({ force: true });
            console.log(`[DockerPool] Removed excess ${type} container`);
          } catch (error) {
            // Ignore
          }
        }
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const stats = {};
    
    for (const [type, pool] of this.pools.entries()) {
      const config = this.poolConfig[type];
      const inUseCount = pool.filter(c => this.inUse.has(c.id)).length;
      
      stats[type] = {
        total: pool.length,
        available: pool.length - inUseCount,
        inUse: inUseCount,
        healthy: pool.filter(c => c.healthy).length,
        min: config?.min || 0,
        max: config?.max || 0
      };
    }
    
    return {
      enabled: this.poolEnabled,
      pools: stats,
      totalContainers: Array.from(this.pools.values()).reduce((sum, pool) => sum + pool.length, 0),
      totalInUse: this.inUse.size
    };
  }

  /**
   * Shutdown pool
   */
  async shutdown() {
    console.log('[DockerPool] Shutting down container pools');
    
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
    }
    
    // Remove all pooled containers
    const promises = [];
    for (const pool of this.pools.values()) {
      for (const containerInfo of pool) {
        promises.push(
          containerInfo.container.remove({ force: true })
            .catch(err => console.error('[DockerPool] Cleanup error:', err))
        );
      }
    }
    
    await Promise.all(promises);
    
    this.pools.clear();
    this.inUse.clear();
    
    console.log('[DockerPool] Shutdown complete');
  }
}

// Export singleton
module.exports = new DockerPool();