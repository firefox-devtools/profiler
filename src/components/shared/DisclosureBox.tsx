/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { useCallback } from 'react';

import './DisclosureBox.css';

type Props = {
  readonly label: string;
  readonly isOpen: boolean;
  readonly onToggle: (isOpen: boolean) => void;
  readonly headerActions?: React.ReactNode;
  readonly children: React.ReactNode;
};

export function DisclosureBox({
  label,
  isOpen,
  onToggle,
  headerActions,
  children,
}: Props) {
  const handleToggle = useCallback(() => {
    onToggle(!isOpen);
  }, [isOpen, onToggle]);

  return (
    <div className={`disclosureBox ${isOpen ? 'open' : 'closed'}`}>
      <div className="disclosureBoxHeader">
        <button
          type="button"
          className="disclosureBoxButton"
          onClick={handleToggle}
          aria-expanded={isOpen}
        >
          <span className="disclosureBoxArrow" aria-hidden="true" />
          {label}
        </button>
        {headerActions ? (
          <div className="disclosureBoxHeaderActions">{headerActions}</div>
        ) : null}
      </div>
      {isOpen ? <div className="disclosureBoxContents">{children}</div> : null}
    </div>
  );
}
