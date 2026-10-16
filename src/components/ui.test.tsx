import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, IconButton, NumberInput, ParamRow, SegmentedControl, Switch, toast, Toasts, TooltipLayer } from './ui';

describe('shared components', () => {
  it('SegmentedControl marks the active segment with aria-pressed', async () => {
    function Demo() {
      const [v, setV] = useState<'a' | 'b'>('a');
      return <SegmentedControl<"a" | "b"> label="Pick" value={v} onChange={setV} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />;
    }
    render(<Demo />);
    expect(screen.getByRole('group', { name: 'Pick' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Switch is a role=switch button', async () => {
    const onChange = vi.fn();
    render(<Switch label="Short stitches" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Short stitches' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('IconButton has an aria-label including the shortcut and shows a tooltip on hover', async () => {
    vi.useFakeTimers();
    render(
      <>
        <IconButton icon="select" label="Select" shortcut="V" hint="Move objects" />
        <TooltipLayer />
      </>,
    );
    const b = screen.getByRole('button', { name: 'Select (V)' });
    fireEvent.mouseEnter(b);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Select');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Move objects · V');
    fireEvent.mouseLeave(b);
    expect(screen.queryByRole('tooltip')).toBeNull();
    vi.useRealTimers();
  });

  it('NumberInput commits clamped values on Enter and reverts on Escape', async () => {
    const onChange = vi.fn();
    render(<NumberInput label="Angle" value={45} min={0} max={180} decimals={0} unit="°" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Angle' });
    await userEvent.clear(input);
    await userEvent.type(input, '200{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(180);
    await userEvent.clear(input);
    await userEvent.type(input, '12{Escape}');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ParamRow keeps slider and number input in sync', async () => {
    function Demo() {
      const [v, setV] = useState(3.5);
      return (
        <div>
          <ParamRow label="Stitch length" value={v} min={1} max={7} step={0.1} unit="mm" decimals={1} numLabel="Stitch length in millimetres" onChange={setV} />
        </div>
      );
    }
    render(<Demo />);
    const slider = screen.getByRole('slider', { name: 'Stitch length' });
    fireEvent.change(slider, { target: { value: '5' } });
    expect(screen.getByRole('textbox', { name: 'Stitch length in millimetres' })).toHaveValue('5.0');
  });

  it('Dialog traps focus and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Export design" onClose={onClose}>
        <button>First</button>
        <button>Last</button>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Export design' })).toBeInTheDocument();
    // Autofocus skips the close button.
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows toasts', () => {
    render(<Toasts />);
    act(() => toast('Downloaded design.pes'));
    expect(screen.getByRole('status')).toHaveTextContent('Downloaded design.pes');
  });
});
