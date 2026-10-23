'use client';

import { fileStem } from '@/core/export/encode';
import { parseProject, serializeProject } from '@/core/project/project';
import { currentProject, useDocument } from '@/store/document';
import { useUi } from '@/store/ui';
import { downloadText, pickFile } from './files';

export function saveProjectFile(): void {
  const json = serializeProject(currentProject());
  downloadText(json, `${fileStem(useDocument.getState().name)}.icon.json`, 'application/json');
  useUi.getState().toast('Project file saved', 'success');
}

export async function openProjectFile(): Promise<void> {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const project = parseProject(await file.text());
    useDocument.getState().loadProject(project);
    useUi.getState().setMode('draw');
    useUi.getState().toast(`Opened “${project.name}”`, 'success');
  } catch (e) {
    useUi.getState().toast(e instanceof Error ? e.message : 'Could not open file', 'error');
  }
}
