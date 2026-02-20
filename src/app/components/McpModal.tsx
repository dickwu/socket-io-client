'use client';

import { useCallback } from 'react';
import { Modal, Button, InputNumber, Typography, Space, Divider, App } from 'antd';
import {
  PoweroffOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExportOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useMcpStore, useMcpStatusText, useMcpStatusColor } from '../stores/mcpStore';
import { startMcpServer, stopMcpServer, checkClaudeCli, runClaudeMcpAdd } from '../hooks/useTauri';

const { Text } = Typography;

const DEFAULT_PORT = 3333;

/**
 * Generate Cursor MCP deeplink URL for quick installation
 * Format: https://cursor.com/en/install-mcp?name={name}&config={base64_config}
 * @see https://github.com/upstash/context7
 */
function generateCursorDeeplink(port: number): string {
  const config = { url: `http://localhost:${port}/sse` };
  const base64Config = btoa(JSON.stringify(config));
  return `https://cursor.com/en/install-mcp?name=socket-io-client&config=${base64Config}`;
}

/**
 * Generate Claude Code MCP add command
 * @see https://github.com/upstash/context7
 */
function generateClaudeCommand(port: number): string {
  return `claude mcp add --transport http socket-io-client http://localhost:${port}/sse`;
}

export default function McpModal() {
  const { message } = App.useApp();

  const isModalOpen = useMcpStore((state) => state.isModalOpen);
  const status = useMcpStore((state) => state.status);
  const port = useMcpStore((state) => state.port);
  const loading = useMcpStore((state) => state.loading);
  const setStatus = useMcpStore((state) => state.setStatus);
  const setPort = useMcpStore((state) => state.setPort);
  const setLoading = useMcpStore((state) => state.setLoading);
  const closeModal = useMcpStore((state) => state.closeModal);

  const statusText = useMcpStatusText();
  const statusColor = useMcpStatusColor();

  const handleToggleServer = useCallback(async () => {
    setLoading(true);
    try {
      if (status === 'running') {
        const result = await stopMcpServer();
        setStatus(result.status);
        setPort(result.port ?? null);
        message.info('MCP server stopped');
      } else {
        const result = await startMcpServer(port ?? DEFAULT_PORT);
        setStatus(result.status);
        setPort(result.port ?? null);
        message.success(`MCP server running on port ${result.port ?? DEFAULT_PORT}`);
      }
    } catch (err) {
      setStatus('error');
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || 'Failed to toggle MCP server');
    } finally {
      setLoading(false);
    }
  }, [status, port, setLoading, setStatus, setPort, message]);

  const handlePortChange = useCallback(
    (value: number | null) => {
      if (status !== 'running') {
        setPort(value);
      }
    },
    [status, setPort]
  );

  const handleCopyConfig = useCallback(() => {
    const config = JSON.stringify(
      {
        mcpServers: {
          'socket-io-client': {
            url: `http://localhost:${port ?? DEFAULT_PORT}/sse`,
          },
        },
      },
      null,
      2
    );
    navigator.clipboard.writeText(config);
    message.success('MCP config copied to clipboard');
  }, [port, message]);

  const handleQuickInstall = useCallback(async () => {
    const deeplink = generateCursorDeeplink(port ?? DEFAULT_PORT);
    try {
      await openUrl(deeplink);
      message.success('Opening Cursor for MCP installation...');
    } catch {
      // Fallback to window.open for browser mode
      window.open(deeplink, '_blank');
    }
  }, [port, message]);

  const handleCopyClaudeCommand = useCallback(() => {
    const cmd = generateClaudeCommand(port ?? DEFAULT_PORT);
    navigator.clipboard.writeText(cmd);
    message.success('Command copied! Run it in your terminal.');
  }, [port, message]);

  const handleRunClaudeCommand = useCallback(async () => {
    setLoading(true);
    try {
      // First check if Claude CLI is installed
      const check = await checkClaudeCli();
      if (!check.installed) {
        message.error(
          'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code'
        );
        return;
      }

      // Run the mcp add command
      const result = await runClaudeMcpAdd(port ?? DEFAULT_PORT);
      if (result.code === 0) {
        message.success('Claude MCP server registered successfully!');
      } else {
        // Extract meaningful error from output
        let errorMsg = result.stderr || result.stdout || 'Unknown error';
        // Truncate long error messages (like minified JS stack traces)
        if (errorMsg.length > 200) {
          // Try to find a meaningful error message
          const match = errorMsg.match(/Error:\s*(.+?)(?:\n|$)/);
          if (match) {
            errorMsg = match[1];
          } else {
            errorMsg = `Command failed (exit code: ${result.code}). Check your Claude CLI installation.`;
          }
        }
        message.error(`Failed: ${errorMsg}`);
        console.error('Claude CLI full output:', {
          stdout: result.stdout,
          stderr: result.stderr,
          path: check.path,
          version: check.version,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(`Failed to run command: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [port, setLoading, message]);

  const isRunning = status === 'running';

  return (
    <Modal
      title="MCP Server Management"
      open={isModalOpen}
      onCancel={closeModal}
      footer={null}
      width={480}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* Status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--ant-color-bg-container)',
            borderRadius: 8,
            border: '1px solid var(--ant-color-border)',
          }}
        >
          <Space>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: statusColor,
                boxShadow: isRunning ? `0 0 8px ${statusColor}` : 'none',
              }}
            />
            <Text strong>Status: {statusText}</Text>
          </Space>
          {isRunning ? (
            <CheckCircleOutlined style={{ color: statusColor, fontSize: 18 }} />
          ) : (
            <CloseCircleOutlined style={{ color: statusColor, fontSize: 18 }} />
          )}
        </div>

        {/* Port configuration */}
        <div>
          <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
            Server Port
          </Text>
          <InputNumber
            value={port ?? DEFAULT_PORT}
            onChange={handlePortChange}
            min={1024}
            max={65535}
            disabled={isRunning}
            style={{ width: '100%' }}
            placeholder="Enter port number"
          />
          {isRunning && (
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              Stop the server to change port
            </Text>
          )}
        </div>

        {/* Toggle button */}
        <Button
          type={isRunning ? 'default' : 'primary'}
          icon={<PoweroffOutlined />}
          onClick={handleToggleServer}
          loading={loading}
          block
          size="large"
          danger={isRunning}
        >
          {isRunning ? 'Stop MCP Server' : 'Start MCP Server'}
        </Button>

        <Divider style={{ margin: '12px 0' }} />

        {/* Cursor Configuration */}
        <div>
          <Text strong style={{ marginBottom: 8, display: 'block' }}>
            Cursor
          </Text>
          <div
            style={{
              background: 'var(--ant-color-fill-tertiary)',
              padding: 12,
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 11,
              position: 'relative',
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(
                {
                  mcpServers: {
                    'socket-io-client': {
                      url: `http://localhost:${port ?? DEFAULT_PORT}/sse`,
                    },
                  },
                },
                null,
                2
              )}
            </pre>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={handleCopyConfig}
              style={{ position: 'absolute', top: 4, right: 4 }}
            />
          </div>
          <Button
            type="primary"
            icon={<ExportOutlined />}
            onClick={handleQuickInstall}
            block
            style={{ marginTop: 8 }}
          >
            Quick Install in Cursor
          </Button>
        </div>

        {/* Claude Code Configuration */}
        <div>
          <Text strong style={{ marginBottom: 8, display: 'block' }}>
            Claude Code
          </Text>
          <div
            style={{
              background: 'var(--ant-color-fill-tertiary)',
              padding: 12,
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 11,
              position: 'relative',
            }}
          >
            <code style={{ wordBreak: 'break-all' }}>
              {generateClaudeCommand(port ?? DEFAULT_PORT)}
            </code>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={handleCopyClaudeCommand}
              style={{ position: 'absolute', top: 4, right: 4 }}
            />
          </div>
          <Space.Compact block style={{ marginTop: 8 }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRunClaudeCommand}
              loading={loading}
              style={{ flex: 1 }}
            >
              Run for Claude
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyClaudeCommand}>
              Copy
            </Button>
          </Space.Compact>
        </div>
      </Space>
    </Modal>
  );
}
