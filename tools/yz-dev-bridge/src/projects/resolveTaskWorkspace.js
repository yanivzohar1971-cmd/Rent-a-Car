import {
  canonicalizeWorkspacePath,
  legacyProjectIdForTask,
  resolveProject,
  ProjectRegistryError,
} from '../projects/projectRegistry.js';

/**
 * Resolve the trusted Agent workspace for a task from the Project Registry only.
 * Never trusts task instructions / issue text for filesystem paths.
 */
export function resolveTaskWorkspace(task, {
  registry,
  requireExists = true,
} = {}) {
  if (!task) {
    throw new ProjectRegistryError('Task is required for workspace resolution', 'TASK_REQUIRED');
  }
  if (task.metadata?.projectRoutingError) {
    throw new ProjectRegistryError(
      `Refusing Agent launch due to project routing error: ${task.metadata.projectRoutingError}`,
      'PROJECT_ROUTING_ERROR',
    );
  }
  const projectId = legacyProjectIdForTask(task, registry);
  const project = resolveProject(projectId, { registry, requireEnabled: true });
  const workspaceRoot = canonicalizeWorkspacePath(project.workspaceRoot, {
    mustExist: requireExists,
  });
  return {
    projectId: project.id,
    displayName: project.displayName,
    workspaceRoot,
    githubRepo: project.githubRepo || null,
  };
}
