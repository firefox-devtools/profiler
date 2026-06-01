/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';

import classNames from 'classnames';
import { Localized } from '@fluent/react';

import './IdleSearchField.css';

type Props = {
  readonly onIdleAfterChange: (param: string) => void;
  readonly onFocus?: () => void;
  readonly onBlur?: (param: Element | null) => void;
  readonly idlePeriod: number;
  readonly defaultValue: string | null;
  readonly className: string | null;
  readonly title: string | null;
};

export const IdleSearchField = forwardRef<HTMLInputElement, Props>(
  (
    {
      onIdleAfterChange,
      onFocus,
      onBlur,
      idlePeriod,
      defaultValue,
      className,
      title,
    },
    forwardedRef
  ) => {
    const [value, setValue] = useState(defaultValue || '');

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const previouslyNotifiedValue = useRef(value);

    const internalInputRef = useRef<HTMLInputElement | null>(null);

    // Sync forwarded ref with internal input ref
    const setRefs = (input: HTMLInputElement | null) => {
      internalInputRef.current = input;

      if (typeof forwardedRef === 'function') {
        forwardedRef(input);
      } else if (forwardedRef) {
        forwardedRef.current = input;
      }
    };

    // Sync state when defaultValue changes externally
    useEffect(() => {
      setValue(defaultValue || '');
      previouslyNotifiedValue.current = defaultValue || '';
    }, [defaultValue]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const notifyIfChanged = (newValue: string) => {
      if (newValue !== previouslyNotifiedValue.current) {
        previouslyNotifiedValue.current = newValue;
        onIdleAfterChange(newValue);
      }
    };

    const onTimeout = () => {
      timeoutRef.current = null;
      notifyIfChanged(value);
    };

    const onSearchFieldFocus = (
      e: React.FocusEvent<HTMLInputElement>
    ) => {
      e.currentTarget.select();

      if (onFocus) {
        onFocus();
      }
    };

    const onSearchFieldBlur = (
      e: React.FocusEvent<HTMLInputElement>
    ) => {
      if (onBlur) {
        onBlur(e.relatedTarget);
      }
    };

    const onSearchFieldChange = (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const newValue = e.currentTarget.value;

      setValue(newValue);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(onTimeout, idlePeriod);
    };

    const onClearButtonClick = () => {
      if (internalInputRef.current) {
        internalInputRef.current.focus();
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setValue('');
      notifyIfChanged('');
    };

    const onFormSubmit = (
      e: React.FormEvent<HTMLFormElement>
    ) => {
      e.preventDefault();
    };

    return (
      <form
        className={classNames('idleSearchField', className)}
        onSubmit={onFormSubmit}
      >
        <Localized
          id="IdleSearchField--search-input"
          attrs={{ placeholder: true }}
        >
          <input
            ref={setRefs}
            type="search"
            name="search"
            placeholder="Enter filter terms"
            className="idleSearchFieldInput photon-input"
            required={true}
            title={title ?? undefined}
            value={value}
            onChange={onSearchFieldChange}
            onFocus={onSearchFieldFocus}
            onBlur={onSearchFieldBlur}
          />
        </Localized>

        <input
          type="reset"
          className="idleSearchFieldButton"
          onClick={onClearButtonClick}
          tabIndex={-1}
        />
      </form>
    );
  }
);

IdleSearchField.displayName = 'IdleSearchField';
```
