import { useCallback, useMemo, useRef, useState } from 'react';

import { LocalFileService, createFileService } from '@/lib/file-service';
import type { DesktopBridge } from '@/lib/desktop-bridge';

export function useWorkingFolderAuthority(bridge: DesktopBridge | null | undefined) {
  const workingFolderRef = useRef('');
  const workingFolderExplorerIdRef = useRef('');
  const [workingFolder, setWorkingFolder] = useState('/Downloads');
  const [workingFolderExplorerId, setWorkingFolderExplorerId] = useState('');

  const updateWorkingFolderSelection = useCallback((folderPath: string, explorerId = '') => {
    const normalizedFolder = folderPath.trim();
    const normalizedExplorerId = explorerId.trim();
    setWorkingFolder(normalizedFolder);
    workingFolderRef.current = normalizedFolder;
    setWorkingFolderExplorerId(normalizedExplorerId);
    workingFolderExplorerIdRef.current = normalizedExplorerId;
  }, []);

  const fileService = useMemo(
    () => (bridge && workingFolderExplorerId ? createFileService(workingFolderExplorerId) : null),
    [bridge, workingFolderExplorerId],
  );

  const localFileService = useMemo(
    () => (bridge && workingFolderExplorerId ? new LocalFileService(workingFolderExplorerId) : null),
    [bridge, workingFolderExplorerId],
  );

  return {
    fileService,
    localFileService,
    updateWorkingFolderSelection,
    workingFolder,
    workingFolderExplorerId,
    workingFolderExplorerIdRef,
    workingFolderRef,
  };
}
