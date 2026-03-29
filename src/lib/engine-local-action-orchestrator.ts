import type {
  EngineActionExecutionResult,
  EngineRequestedAction,
  PendingApprovalAction,
  SafetyPermissionScope,
} from '@/app-types';
import type { DesktopBridgeApi } from './connectors/connector-types';
import { summarizeEngineRequestedAction } from './engine-action-protocol';
import { buildEngineActionExecutionResult } from './engine-session-events';
import { resolveLocalActionPolicy } from './safety-policy';

type ApprovalDecision = {
  approved: boolean;
  reason?: string;
  expired?: boolean;
};

type ValidateProjectRelativePath = (
  inputPath: string,
  options?: { allowEmpty?: boolean },
) => { ok: true } | { ok: false; reason: string };

export async function executeEngineLocalActionPlan(params: {
  actions: EngineRequestedAction[];
  maxActionsPerRun: number;
  bridge: DesktopBridgeApi;
  rootPath: string;
  runId: string;
  projectId?: string;
  projectTitle?: string;
  safetyScopes: SafetyPermissionScope[];
  validateProjectRelativePath: ValidateProjectRelativePath;
  requestApproval: (request: PendingApprovalAction) => Promise<ApprovalDecision>;
  onRunStatus: (status: string, details: string) => void;
  onTaskStatus?: (status: 'needs_approval' | 'approved' | 'rejected', summary: string, outcome?: string) => void;
}): Promise<EngineActionExecutionResult> {
  const boundedActions = params.actions.slice(0, params.maxActionsPerRun);
  const actionReceipts: EngineActionExecutionResult['receipts'] = [];
  const previews: string[] = [];
  const errors: string[] = [];

  if (params.actions.length > params.maxActionsPerRun) {
    errors.push(
      `Action limit exceeded: received ${params.actions.length}, executed ${params.maxActionsPerRun}.`,
    );
  }

  const formatPreviewContent = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return '(empty)';
    }
    const maxChars = 1200;
    if (trimmed.length <= maxChars) {
      return trimmed;
    }
    return `${trimmed.slice(0, maxChars)}\n... (truncated)`;
  };

  const mapLocalActionErrorCode = (message: string): string => {
    const normalized = message.toLowerCase();
    if (normalized.includes('already exists')) {
      return 'FILE_EXISTS';
    }
    if (normalized.includes('not found') || normalized.includes('enoent')) {
      return 'NOT_FOUND';
    }
    if (normalized.includes('blocked') || normalized.includes('outside') || normalized.includes('traversal')) {
      return 'PROJECT_BOUNDARY_BLOCK';
    }
    if (normalized.includes('permission') || normalized.includes('eacces') || normalized.includes('eperm')) {
      return 'PERMISSION_DENIED';
    }
    if (normalized.includes('timeout')) {
      return 'TIMEOUT';
    }
    return 'ACTION_FAILED';
  };

  const isLowRiskTextWriteAction = (action: EngineRequestedAction) => {
    if (action.type !== 'create_file' && action.type !== 'append_file') {
      return false;
    }

    if (action.type === 'create_file' && action.overwrite) {
      return false;
    }

    const normalizedPath = action.path.replace(/\\/g, '/').trim();
    if (!normalizedPath || normalizedPath.includes('/')) {
      return false;
    }

    const lowered = normalizedPath.toLowerCase();
    const isTextFile = lowered.endsWith('.md') || lowered.endsWith('.txt');
    if (!isTextFile) {
      return false;
    }

    return action.content.length <= 20_000;
  };

  const isDestructiveLocalAction = (actionType: PendingApprovalAction['actionType']) =>
    actionType === 'delete' || actionType === 'rename';

  for (let index = 0; index < boundedActions.length; index += 1) {
    const action = boundedActions[index];
    const actionId = action.id || `action-${index + 1}`;
    const actionPath = action.path ?? '.';
    const policy = resolveLocalActionPolicy(action.type, params.safetyScopes);
    let createFileOverwriteApproved = false;
    let approvedByOperator = false;

    const pathValidation = params.validateProjectRelativePath(actionPath, {
      allowEmpty: action.type === 'list_dir',
    });
    if (!pathValidation.ok) {
      const message = `Blocked by project boundary: ${pathValidation.reason}`;
      errors.push(`${actionPath || '.'}: ${message}`);
      actionReceipts.push({
        id: actionId,
        type: action.type,
        path: actionPath || '.',
        status: 'error',
        errorCode: 'PROJECT_BOUNDARY_BLOCK',
        message,
      });
      continue;
    }

    if (action.type === 'rename') {
      const targetValidation = params.validateProjectRelativePath(action.newPath);
      if (!targetValidation.ok) {
        const message = `Blocked by project boundary: ${targetValidation.reason}`;
        errors.push(`${action.newPath}: ${message}`);
        actionReceipts.push({
          id: actionId,
          type: action.type,
          path: action.newPath,
          status: 'error',
          errorCode: 'PROJECT_BOUNDARY_BLOCK',
          message,
        });
        continue;
      }
    }

    if (
      (action.type === 'create_file' || action.type === 'append_file' || action.type === 'rename' || action.type === 'delete')
      && !params.projectId
    ) {
      const message = 'Blocked: write actions require an active project context.';
      errors.push(`${actionPath}: ${message}`);
      actionReceipts.push({
        id: actionId,
        type: action.type,
        path: actionPath,
        status: 'error',
        errorCode: 'PROJECT_REQUIRED',
        message,
      });
      continue;
    }

    if (!policy.enabled) {
      const message = `Blocked by safety policy: ${policy.scopeName} is disabled.`;
      errors.push(`${actionPath}: ${message}`);
      actionReceipts.push({
        id: actionId,
        type: action.type,
        path: actionPath,
        status: 'error',
        errorCode: 'BLOCKED_BY_POLICY',
        message,
      });
      continue;
    }

    if (action.type === 'create_file' && !action.overwrite && params.bridge.existsInFolder) {
      try {
        const existing = await params.bridge.existsInFolder(params.rootPath, action.path) as {
          exists: boolean;
        };
        if (existing.exists) {
          const overwriteApprovalId = `${params.runId}-${actionId}-${index + 1}-overwrite`;
          params.onRunStatus(
            `Awaiting overwrite approval for ${actionPath}...`,
            `File exists at ${actionPath}. Awaiting overwrite approval.`,
          );

          const overwriteDecision = await params.requestApproval({
            id: overwriteApprovalId,
            runId: params.runId,
            actionId,
            actionType: action.type,
            projectId: params.projectId,
            projectTitle: params.projectTitle,
            projectRootFolder: params.rootPath,
            path: actionPath,
            scopeId: policy.scopeId,
            scopeName: policy.scopeName,
            riskLevel: 'high',
            summary: `${params.projectTitle ? `[${params.projectTitle}] ` : ''}Overwrite existing file ${actionPath}`,
            preview: [
              'The file already exists.',
              'Approve to overwrite it with the new generated content.',
              '',
              formatPreviewContent(action.content),
            ].join('\n'),
            createdAt: Date.now(),
          });

          if (!overwriteDecision.approved) {
            const reason = overwriteDecision.reason || 'Overwrite rejected by operator.';
            const code = overwriteDecision.expired ? 'APPROVAL_TIMEOUT' : 'REJECTED_BY_OPERATOR';
            errors.push(`${actionPath}: ${reason}`);
            actionReceipts.push({
              id: actionId,
              type: action.type,
              path: actionPath,
              status: 'error',
              errorCode: code,
              message: reason,
            });
            continue;
          }

          approvedByOperator = true;
          createFileOverwriteApproved = true;
          previews.push(`Approved overwrite create_file -> ${actionPath}`);
          params.onTaskStatus?.('approved', `Approved overwrite: ${action.type} ${actionPath}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to verify file existence.';
        errors.push(`${actionPath}: ${message}`);
        actionReceipts.push({
          id: actionId,
          type: action.type,
          path: actionPath,
          status: 'error',
          errorCode: 'ACTION_FAILED',
          message,
        });
        continue;
      }
    }

    const autoApproved = policy.requiresApproval && isLowRiskTextWriteAction(action);
    const requiresHardApproval = isDestructiveLocalAction(action.type) || policy.riskLevel === 'critical';

    if ((policy.requiresApproval || requiresHardApproval) && !autoApproved && !approvedByOperator) {
      const approvalId = `${params.runId}-${actionId}-${index + 1}`;
      const previewBody =
        action.type === 'create_file' || action.type === 'append_file'
          ? formatPreviewContent(action.content)
          : summarizeEngineRequestedAction(action);

      params.onRunStatus(
        `Awaiting approval for ${action.type} (${actionPath})...`,
        `Awaiting operator approval for ${action.type} on ${actionPath}.`,
      );
      params.onTaskStatus?.('needs_approval', `Needs approval: ${summarizeEngineRequestedAction(action)}`);

      const decision = await params.requestApproval({
        id: approvalId,
        runId: params.runId,
        actionId,
        actionType: action.type,
        projectId: params.projectId,
        projectTitle: params.projectTitle,
        projectRootFolder: params.rootPath,
        path: actionPath,
        scopeId: policy.scopeId,
        scopeName: policy.scopeName,
        riskLevel: policy.riskLevel,
        summary: `${params.projectTitle ? `[${params.projectTitle}] ` : ''}${summarizeEngineRequestedAction(action)}`,
        preview: previewBody,
        createdAt: Date.now(),
      });

      if (!decision.approved) {
        const reason = decision.reason || 'Rejected by operator.';
        const code = decision.expired ? 'APPROVAL_TIMEOUT' : 'REJECTED_BY_OPERATOR';
        errors.push(`${actionPath}: ${reason}`);
        params.onTaskStatus?.('rejected', `Rejected: ${summarizeEngineRequestedAction(action)}`, reason);
        actionReceipts.push({
          id: actionId,
          type: action.type,
          path: actionPath,
          status: 'error',
          errorCode: code,
          message: reason,
        });
        continue;
      }

      previews.push(`Approved ${action.type} -> ${actionPath}`);
      params.onTaskStatus?.('approved', `Approved: ${summarizeEngineRequestedAction(action)}`);
    } else if (autoApproved) {
      previews.push(`Auto-approved ${action.type} -> ${actionPath}`);
      params.onTaskStatus?.('approved', `Auto-approved: ${summarizeEngineRequestedAction(action)}`);
    }

    try {
      if (action.type === 'create_file') {
        if (!params.bridge.createFileInFolder) {
          const message = `${actionPath}: create_file is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'create_file',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.createFileInFolder(
          params.rootPath,
          action.path,
          action.content,
          createFileOverwriteApproved ? true : action.overwrite,
        ) as { filePath: string };
        actionReceipts.push({
          id: actionId,
          type: 'create_file',
          path: result.filePath,
          status: 'ok',
        });
        previews.push(`+ ${result.filePath}`);
        continue;
      }

      if (action.type === 'append_file') {
        if (!params.bridge.appendFileInFolder) {
          const message = `${actionPath}: append_file is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'append_file',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.appendFileInFolder(params.rootPath, action.path, action.content) as {
          filePath: string;
          bytesAppended: number;
        };
        actionReceipts.push({
          id: actionId,
          type: 'append_file',
          path: result.filePath,
          status: 'ok',
          message: `Appended ${result.bytesAppended} bytes`,
        });
        previews.push(`+ appended ${result.bytesAppended} bytes -> ${result.filePath}`);
        continue;
      }

      if (action.type === 'read_file') {
        if (!params.bridge.readFileInFolder) {
          const message = `${actionPath}: read_file is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'read_file',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.readFileInFolder(params.rootPath, action.path) as {
          filePath: string;
          content: string;
        };
        actionReceipts.push({
          id: actionId,
          type: 'read_file',
          path: result.filePath,
          status: 'ok',
        });
        previews.push(`> ${result.filePath}`);
        previews.push('```');
        previews.push(formatPreviewContent(result.content));
        previews.push('```');
        continue;
      }

      if (action.type === 'list_dir') {
        if (!params.bridge.listDirInFolder) {
          const message = `${actionPath}: list_dir is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'list_dir',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.listDirInFolder(params.rootPath, action.path || '') as {
          items: Array<{ kind: 'directory' | 'file'; path: string }>;
          truncated?: boolean;
        };
        actionReceipts.push({
          id: actionId,
          type: 'list_dir',
          path: action.path || '.',
          status: 'ok',
          message: `Listed ${result.items.length} items${result.truncated ? ' (truncated)' : ''}`,
        });
        previews.push(`# list_dir ${action.path || '.'}`);
        previews.push(...result.items.slice(0, 20).map((item) => `${item.kind === 'directory' ? '[dir]' : '[file]'} ${item.path}`));
        if (result.truncated) {
          previews.push('... (truncated)');
        }
        continue;
      }

      if (action.type === 'exists') {
        if (!params.bridge.existsInFolder) {
          const message = `${actionPath}: exists is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'exists',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.existsInFolder(params.rootPath, action.path) as {
          path: string;
          exists: boolean;
          kind?: string;
        };
        actionReceipts.push({
          id: actionId,
          type: 'exists',
          path: result.path,
          status: 'ok',
          message: result.exists ? result.kind : 'none',
        });
        previews.push(`? ${result.path} => ${result.exists ? result.kind : 'none'}`);
        continue;
      }

      if (action.type === 'stat') {
        if (!params.bridge.statInFolder) {
          const message = `${actionPath}: stat is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'stat',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.statInFolder(params.rootPath, action.path) as {
          path: string;
          kind: string;
          size: number;
          modifiedMs: number;
        };
        actionReceipts.push({
          id: actionId,
          type: 'stat',
          path: result.path,
          status: 'ok',
          message: `${result.kind} ${result.size} bytes`,
        });
        previews.push(`Stat: ${result.path}`);
        previews.push(`Kind: ${result.kind}`);
        previews.push(`Size: ${result.size}`);
        previews.push(`ModifiedMs: ${Math.round(result.modifiedMs)}`);
        continue;
      }

      if (action.type === 'rename') {
        if (!params.bridge.renameInFolder) {
          const message = `${actionPath}: rename is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'rename',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.renameInFolder(params.rootPath, action.path, action.newPath) as {
          oldPath: string;
          newPath: string;
        };
        actionReceipts.push({
          id: actionId,
          type: 'rename',
          path: result.newPath,
          status: 'ok',
          message: `Renamed ${result.oldPath} -> ${result.newPath}`,
        });
        previews.push(`~ ${result.oldPath} -> ${result.newPath}`);
        continue;
      }

      if (action.type === 'delete') {
        if (!params.bridge.deleteInFolder) {
          const message = `${actionPath}: delete is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'delete',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const result = await params.bridge.deleteInFolder(params.rootPath, action.path) as {
          path: string;
        };
        actionReceipts.push({
          id: actionId,
          type: 'delete',
          path: result.path,
          status: 'ok',
          message: 'Deleted',
        });
        previews.push(`- deleted ${result.path}`);
        continue;
      }

      if (action.type === 'shell_exec') {
        if (!params.bridge.shellExec) {
          const message = `${actionPath}: shell_exec is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'shell_exec',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const timeoutMs = typeof action.timeoutMs === 'number' ? action.timeoutMs : 30_000;
        const result = await params.bridge.shellExec(params.rootPath, action.command, timeoutMs) as {
          exitCode: number;
          stdout?: string;
          stderr?: string;
          timedOut?: boolean;
        };
        const ok = result.exitCode === 0;
        actionReceipts.push({
          id: actionId,
          type: 'shell_exec',
          path: actionPath,
          status: ok ? 'ok' : 'error',
          message: result.timedOut ? 'Command timed out' : (ok ? 'Exit 0' : `Exit ${result.exitCode}`),
        });
        previews.push(`$ ${action.command}`);
        if (result.stdout) {
          previews.push('```');
          previews.push(result.stdout.slice(0, 2000));
          previews.push('```');
        }
        if (result.stderr) {
          previews.push('stderr:');
          previews.push('```');
          previews.push(result.stderr.slice(0, 1000));
          previews.push('```');
        }
        continue;
      }

      if (action.type === 'web_fetch') {
        if (!params.bridge.webFetch) {
          const message = `${actionPath}: web_fetch is unavailable in this app context.`;
          errors.push(message);
          actionReceipts.push({
            id: actionId,
            type: 'web_fetch',
            path: actionPath,
            status: 'error',
            errorCode: 'UNAVAILABLE',
            message,
          });
          continue;
        }

        const method = typeof action.method === 'string' ? action.method : 'GET';
        const headers: Record<string, string> = {};
        if (typeof action.contentType === 'string') {
          headers['Content-Type'] = action.contentType;
        }
        const result = await params.bridge.webFetch(action.url, {
          method,
          headers,
          body: action.body,
        }) as {
          status: number;
          statusText: string;
          truncated?: boolean;
          body?: string;
        };
        const ok = result.status >= 200 && result.status < 400;
        actionReceipts.push({
          id: actionId,
          type: 'web_fetch',
          path: action.url,
          status: ok ? 'ok' : 'error',
          message: `${result.status} ${result.statusText}${result.truncated ? ' (truncated)' : ''}`,
        });
        previews.push(`> fetch ${method} ${action.url} => ${result.status}`);
        if (result.body) {
          previews.push('```');
          previews.push(result.body.slice(0, 2000));
          previews.push('```');
        }
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown local file action error.';
      const fullMessage = `${actionPath}: ${message}`;
      errors.push(fullMessage);
      actionReceipts.push({
        id: actionId,
        type: action.type,
        path: actionPath,
        status: 'error',
        errorCode: mapLocalActionErrorCode(message),
        message,
      });
    }
  }

  return buildEngineActionExecutionResult({
    runId: params.runId,
    receipts: actionReceipts,
    previews,
    errors,
    projectTitle: params.projectTitle,
    rootPath: params.rootPath,
  });
}
