import { describe, expect, it, vi } from 'vitest';
import { enableSelection } from './selection';
import { renderTree } from './tree';

function setup() {
  const tree = renderTree({ a: 1, b: { c: 2 }, site: 'https://contoso.example' }, { expandDepth: 2 });
  const onSelect = vi.fn();
  enableSelection(tree, onSelect);
  const row = (path: string) => tree.querySelector<HTMLElement>(`.row[data-path="${path}"]`) as HTMLElement;
  return { tree, onSelect, row };
}

describe('enableSelection', () => {
  it('selects the clicked line and reports it', () => {
    const { onSelect, row } = setup();

    row('$.a').querySelector<HTMLElement>('.number')?.click();

    expect(row('$.a').classList.contains('selected')).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(row('$.a'));
  });

  it('keeps only one line selected', () => {
    const { tree, row } = setup();

    row('$.a').click();
    row('$.b.c').click();

    expect(tree.querySelectorAll('.row.selected')).toHaveLength(1);
    expect(row('$.b.c').classList.contains('selected')).toBe(true);
  });

  it('selects an object or array by its first line', () => {
    const { onSelect, row } = setup();
    row('$.b').click();
    expect(onSelect).toHaveBeenCalledWith(row('$.b'));
  });

  it('does not select the line when its fold arrow is clicked', () => {
    const { onSelect, row } = setup();
    row('$.b').querySelector<HTMLButtonElement>('.toggle')?.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not select the line when its unfold-everything button is clicked', () => {
    const { onSelect, row } = setup();
    row('$.b').querySelector<HTMLButtonElement>('.expand-all')?.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not select the line when a link in it is clicked', () => {
    const { onSelect, row } = setup();
    const link = row('$.site').querySelector('a') as HTMLAnchorElement;
    // Stop the test browser from trying to open the address.
    link.addEventListener('click', (event) => event.preventDefault());

    link.click();

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not select closing-bracket lines, which have no value of their own', () => {
    const { tree, onSelect } = setup();
    tree.querySelector<HTMLElement>('.branch-tail')?.click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
