/**
 * Resource triples modal
 *
 * Displays the result of a background query for the triples in which a
 * resource is the subject (or object) in a popup window. URIs are shown with
 * the prefixes declared in the main query.
 * Parsed triples are shown in a table; the raw response text is available on a
 * separate tab.
 *
 * URIs in the triples table can be Ctrl+clicked to describe them in turn. The
 * modal keeps those hops in a history that its back, forward and back-to-start
 * buttons (and Alt+←/→) walk through, like a browser.
 *
 * @deprecated The plugin opens IRIs in the YASR host's shared describe panel
 * (`yasr.describe()`) when the host offers one. This modal is only the
 * fallback for YASR versions without it and will be removed in the next major
 * version.
 */

import { DescribeParseResult, DescribeTriple, formatDescribeObject } from './describe-parser';
import { PrefixMap } from '../types';
import { ResourceDirection, directionLabel, toPrefixedName } from './resource-query';
import { icon } from '../icons';
import type { IconName } from '../icons';

/** How the modal should present the query it is showing. */
export interface DescribeModalView {
  /** Which triples were requested. Defaults to `'subject'`. */
  direction?: ResourceDirection;
  /** Prefixes used to abbreviate URIs in the title and triples table. */
  prefixes?: PrefixMap;
}

export type DescribeModalTab = 'triples' | 'raw';

/** One describe in the modal's navigation history. */
export interface DescribeHistoryEntry {
  uri: string;
  direction: ResourceDirection;
}

export interface DescribeModalCallbacks {
  /**
   * Fetch and show the triples of a URI. Called for Ctrl+clicks inside the
   * modal and for back/forward navigation; the modal has already updated its
   * history.
   */
  onDescribe?: (uri: string, direction: ResourceDirection) => void;
}

/**
 * @deprecated Fallback for YASR versions without `yasr.describe()`; will be
 * removed in the next major version.
 */
export class DescribeModal {
  private backdrop: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private contentArea: HTMLElement | null = null;
  private currentTab: DescribeModalTab = 'triples';
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private view: Required<DescribeModalView> = { direction: 'subject', prefixes: {} };
  private history: DescribeHistoryEntry[] = [];
  private historyIndex = -1;

  constructor(private callbacks: DescribeModalCallbacks = {}) {}

  /**
   * Start a fresh navigation history for a describe launched from outside the
   * modal (the chart).
   */
  startHistory(uri: string, direction: ResourceDirection): void {
    this.history = [{ uri, direction }];
    this.historyIndex = 0;
  }

  /**
   * Describe a URI reached from inside the modal, adding it to the history.
   * Entries after the current one (left by going back) are dropped.
   */
  navigate(uri: string, direction: ResourceDirection): void {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push({ uri, direction });
    this.historyIndex = this.history.length - 1;
    this.callbacks.onDescribe?.(uri, direction);
  }

  getHistory(): DescribeHistoryEntry[] {
    return [...this.history];
  }

  canGoBack(): boolean {
    return this.historyIndex > 0;
  }

  canGoForward(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /** Show the previous entry of the history. */
  back(): void {
    this.goTo(this.historyIndex - 1);
  }

  /** Show the next entry of the history. */
  forward(): void {
    this.goTo(this.historyIndex + 1);
  }

  /** Show the first entry of the history: the original describe. */
  backToStart(): void {
    this.goTo(0);
  }

  private goTo(index: number): void {
    if (index < 0 || index >= this.history.length || index === this.historyIndex) {
      return;
    }
    this.historyIndex = index;
    const { uri, direction } = this.history[index];
    this.callbacks.onDescribe?.(uri, direction);
  }

  /**
   * Show the modal in a loading state.
   */
  showLoading(uri: string, view?: DescribeModalView): void {
    this.setView(view);
    this.render(uri, { state: 'loading' });
  }

  /**
   * Show the modal with parsed DESCRIBE results.
   */
  showResults(uri: string, result: DescribeParseResult, view?: DescribeModalView): void {
    this.setView(view);
    this.currentTab = result.triples.length > 0 ? 'triples' : 'raw';
    this.render(uri, { state: 'results', result });
  }

  /**
   * Show the modal after a query error.
   */
  showError(uri: string, error: unknown, raw?: string, view?: DescribeModalView): void {
    this.setView(view);
    this.currentTab = 'raw';
    this.render(uri, { state: 'error', error, raw: raw || '' });
  }

  /**
   * Close the modal and clean up event listeners.
   */
  close(): void {
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
    }
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
    this.contentArea = null;
  }

  private setView(view?: DescribeModalView): void {
    this.view = {
      direction: view?.direction ?? 'subject',
      prefixes: view?.prefixes ?? {},
    };
  }

  private render(
    uri: string,
    payload:
      | { state: 'loading' }
      | { state: 'results'; result: DescribeParseResult }
      | { state: 'error'; error: unknown; raw: string }
  ): void {
    this.close();

    // Backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'chart-modal-backdrop chart-describe-modal-backdrop';
    this.backdrop.addEventListener('click', () => this.close());

    // Modal container
    this.modal = document.createElement('div');
    this.modal.className = 'chart-modal chart-describe-modal';
    this.modal.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'chart-modal-header chart-describe-modal-header';

    const title = document.createElement('h3');
    title.className = 'chart-modal-title';
    const label = directionLabel(this.view.direction);
    title.textContent = `Triples ${label}: ${this.shorten(this.displayUri(uri))}`;
    title.title = uri;

    const closeButton = document.createElement('button');
    closeButton.className = 'chart-modal-close';
    closeButton.type = 'button';
    closeButton.appendChild(icon('x', 20));
    closeButton.setAttribute('aria-label', 'Close modal');
    closeButton.addEventListener('click', () => this.close());

    header.appendChild(this.createNavigation());
    header.appendChild(title);
    header.appendChild(closeButton);

    // Content area
    this.contentArea = document.createElement('div');
    this.contentArea.className = 'chart-modal-content chart-describe-modal-content';

    if (payload.state === 'loading') {
      this.contentArea.appendChild(this.createLoadingView());
    } else if (payload.state === 'error') {
      this.contentArea.appendChild(this.createErrorView(payload.error, payload.raw));
    } else {
      this.contentArea.appendChild(this.createResultsView(payload.result));
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'chart-modal-footer chart-describe-modal-footer';

    const hint = document.createElement('span');
    hint.className = 'chart-describe-modal-hint';
    hint.textContent =
      'Ctrl+click a URI to describe it, Ctrl+Shift+click for the triples where it is the object.';

    const copyButton = document.createElement('button');
    copyButton.className = 'chart-modal-button';
    copyButton.textContent = 'Copy raw';
    copyButton.addEventListener('click', () => {
      const rawText =
        payload.state === 'results'
          ? payload.result.raw
          : payload.state === 'error'
            ? payload.raw
            : '';
      this.copyToClipboard(rawText);
      this.close();
    });

    const closeFooterButton = document.createElement('button');
    closeFooterButton.className = 'chart-modal-button chart-modal-button-secondary';
    closeFooterButton.textContent = 'Close';
    closeFooterButton.addEventListener('click', () => this.close());

    const buttons = document.createElement('div');
    buttons.className = 'chart-describe-modal-footer-buttons';
    buttons.appendChild(copyButton);
    buttons.appendChild(closeFooterButton);

    footer.appendChild(hint);
    footer.appendChild(buttons);

    this.modal.appendChild(header);
    this.modal.appendChild(this.contentArea);
    this.modal.appendChild(footer);

    document.body.appendChild(this.backdrop);
    document.body.appendChild(this.modal);

    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      } else if (e.altKey && e.key === 'ArrowLeft' && this.canGoBack()) {
        e.preventDefault();
        this.back();
      } else if (e.altKey && e.key === 'ArrowRight' && this.canGoForward()) {
        e.preventDefault();
        this.forward();
      }
    };
    document.addEventListener('keydown', this.escapeHandler);

    closeButton.focus();
  }

  /** Back to start, back and forward buttons. */
  private createNavigation(): HTMLElement {
    const nav = document.createElement('div');
    nav.className = 'chart-describe-modal-nav';

    const button = (
      className: string,
      iconName: IconName,
      label: string,
      enabled: boolean,
      onClick: () => void
    ) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chart-describe-modal-nav-button ${className}`;
      btn.appendChild(icon(iconName));
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.disabled = !enabled;
      btn.addEventListener('click', onClick);
      return btn;
    };

    nav.appendChild(
      button('chart-describe-modal-start', 'chevrons-left', 'Back to start', this.canGoBack(), () =>
        this.backToStart()
      )
    );
    nav.appendChild(
      button('chart-describe-modal-back', 'chevron-left', 'Back (Alt+←)', this.canGoBack(), () =>
        this.back()
      )
    );
    nav.appendChild(
      button(
        'chart-describe-modal-forward',
        'chevron-right',
        'Forward (Alt+→)',
        this.canGoForward(),
        () => this.forward()
      )
    );
    return nav;
  }

  private createLoadingView(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'chart-describe-modal-loading';

    const spinner = document.createElement('div');
    spinner.className = 'chart-describe-modal-spinner';

    const text = document.createElement('p');
    text.textContent = `Fetching triples ${directionLabel(this.view.direction)}…`;

    container.appendChild(spinner);
    container.appendChild(text);
    return container;
  }

  private createErrorView(error: unknown, raw: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'chart-describe-modal-error';

    const message = document.createElement('p');
    message.textContent = `Failed to fetch triples: ${this.errorMessage(error)}`;

    container.appendChild(message);

    if (raw) {
      container.appendChild(this.createRawSection(raw));
    }

    return container;
  }

  private createResultsView(result: DescribeParseResult): HTMLElement {
    const container = document.createElement('div');
    container.className = 'chart-describe-modal-results';

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'chart-describe-modal-tabs';

    const triplesTab = document.createElement('button');
    triplesTab.className = `chart-describe-modal-tab ${this.currentTab === 'triples' ? 'active' : ''}`;
    triplesTab.textContent = `Triples (${result.triples.length})`;
    triplesTab.addEventListener('click', () => {
      this.currentTab = 'triples';
      this.refreshResultsView(result);
    });

    const rawTab = document.createElement('button');
    rawTab.className = `chart-describe-modal-tab ${this.currentTab === 'raw' ? 'active' : ''}`;
    rawTab.textContent = 'Raw';
    rawTab.addEventListener('click', () => {
      this.currentTab = 'raw';
      this.refreshResultsView(result);
    });

    tabs.appendChild(triplesTab);
    tabs.appendChild(rawTab);
    container.appendChild(tabs);

    // Tab content
    const tabContent = document.createElement('div');
    tabContent.className = 'chart-describe-modal-tab-content';

    if (this.currentTab === 'triples') {
      if (result.triples.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'chart-describe-modal-empty';
        empty.textContent = 'No triples could be parsed from the response.';
        tabContent.appendChild(empty);
      } else {
        tabContent.appendChild(this.createTriplesTable(result.triples));
      }
    } else {
      tabContent.appendChild(this.createRawSection(result.raw));
    }

    container.appendChild(tabContent);
    return container;
  }

  private refreshResultsView(result: DescribeParseResult): void {
    if (!this.contentArea) {
      return;
    }
    this.contentArea.innerHTML = '';
    this.contentArea.appendChild(this.createResultsView(result));
  }

  private createTriplesTable(triples: DescribeTriple[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-describe-modal-table-wrapper';

    const table = document.createElement('table');
    table.className = 'chart-describe-modal-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['Subject', 'Predicate', 'Object']) {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const triple of triples) {
      const row = document.createElement('tr');

      const subjectIsBnode =
        triple.subject.startsWith('_:') || !/^[a-z][a-z0-9+.-]*:/i.test(triple.subject);
      row.appendChild(
        subjectIsBnode
          ? this.createCell(triple.subject, triple.subject)
          : this.createUriCell(triple.subject)
      );
      row.appendChild(this.createUriCell(triple.predicate));
      row.appendChild(
        triple.object.type === 'uri'
          ? this.createUriCell(triple.object.value)
          : this.createCell(this.displayObject(triple.object), this.fullObject(triple.object))
      );

      tbody.appendChild(row);
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    return wrapper;
  }

  private createRawSection(raw: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-describe-modal-raw';

    if (!raw.trim()) {
      const empty = document.createElement('p');
      empty.className = 'chart-describe-modal-empty';
      empty.textContent = 'No raw response text available.';
      wrapper.appendChild(empty);
      return wrapper;
    }

    const pre = document.createElement('pre');
    pre.textContent = raw;
    wrapper.appendChild(pre);
    return wrapper;
  }

  private createCell(text: string, title: string): HTMLTableCellElement {
    const cell = document.createElement('td');
    cell.textContent = text;
    cell.title = title;
    return cell;
  }

  /**
   * Cell holding a URI link. A plain click opens the URI; Ctrl+click (Cmd+click
   * on macOS) describes it as subject, Ctrl+Shift+click as object.
   */
  private createUriCell(uri: string): HTMLTableCellElement {
    const cell = document.createElement('td');
    cell.title = uri;

    const link = document.createElement('a');
    link.className = 'chart-uri-link chart-describe-modal-uri';
    link.href = uri;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = this.displayUri(uri);
    link.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.navigate(uri, e.shiftKey ? 'object' : 'subject');
      }
    });

    cell.appendChild(link);
    return cell;
  }

  /** Prefixed name when a query prefix matches, otherwise `<uri>`. */
  private displayUri(uri: string): string {
    return toPrefixedName(uri, this.view.prefixes) ?? `<${uri}>`;
  }

  private displayObject(object: DescribeTriple['object']): string {
    if (object.type === 'uri') {
      return this.displayUri(object.value);
    }
    if (object.type === 'bnode') {
      return object.value;
    }
    let formatted = `"${object.value}"`;
    if (object.lang) {
      formatted += `@${object.lang}`;
    } else if (object.datatype) {
      formatted += `^^${this.displayUri(object.datatype)}`;
    }
    return formatted;
  }

  private fullObject(object: DescribeTriple['object']): string {
    return object.type === 'uri' ? object.value : formatDescribeObject(object);
  }

  private shorten(text: string): string {
    if (text.length <= 60) {
      return text;
    }
    return text.slice(0, 30) + '…' + text.slice(-25);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  private async copyToClipboard(content: string): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (error) {
      console.error('Failed to copy raw response to clipboard:', error);
    }
  }
}
