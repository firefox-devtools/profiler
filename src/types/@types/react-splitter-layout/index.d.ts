import * as React from 'react';

interface SplitterLayoutProps {
  customClassName?: string;
  vertical?: boolean;
  percentage?: boolean;
  primaryIndex?: 0 | 1;
  primaryMinSize?: number;
  secondaryMinSize?: number;
  secondaryInitialSize?: number;
  onDragStart?: () => unknown;
  onDragEnd?: () => unknown;
  onSecondaryPaneSizeChange?: (size: number) => unknown;
  children: React.ReactNode;
}

declare const SplitterLayout: React.ComponentType<SplitterLayoutProps>;

export default SplitterLayout;
