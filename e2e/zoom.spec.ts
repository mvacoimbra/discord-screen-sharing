import { test, expect, createRoom, joinRoom, shareScreen, invite, comSom, type User } from './fixtures';

const unique = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

/** A transformação aplicada no nó que embrulha o canvas do palco. */
const transformOf = (u: User) =>
  u.page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].find((x) => x.width > 2 && x.height > 2);
    return (c?.parentElement as HTMLElement | null)?.style.transform ?? null;
  });

test('quem assiste amplia, arrasta e volta a tela do palco', async ({ spawn }) => {
  const ana = await spawn('Ana');
  const bia = await spawn('Bia');
  await comSom(ana);
  const room = unique('zoom');
  await createRoom(ana, room);
  await shareScreen(ana);

  await joinRoom(bia, room);
  await invite(bia).click();
  // Palco (Foco): só a tela grande amplia, a grade usa o duplo clique para focar.
  await bia.page.keyboard.press('g');

  const group = bia.page.getByRole('group', { name: 'Zoom da tela' });
  await expect(group).toBeVisible({ timeout: 15_000 });
  const pct = group.getByRole('button', { name: /^Zoom em/ });
  await expect(pct).toHaveText('100%');
  await expect(group.getByRole('button', { name: 'Diminuir zoom' })).toBeDisabled();

  // Botão: amplia pelo centro.
  await group.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect(pct).toHaveText('125%');
  expect(await transformOf(bia)).toMatch(/scale\(1\.25\)/);

  // Roda do mouse sobre a imagem: amplia mais.
  const box = await bia.page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('sem canvas no palco');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await bia.page.mouse.move(cx, cy);
  await bia.page.mouse.wheel(0, -400);
  await expect.poll(async () => Number((await pct.textContent())?.replace('%', ''))).toBeGreaterThan(125);

  // Arrastar move o recorte.
  const before = await transformOf(bia);
  await bia.page.mouse.down();
  await bia.page.mouse.move(cx + 80, cy + 60, { steps: 5 });
  await bia.page.mouse.up();
  expect(await transformOf(bia)).not.toBe(before);

  // Duplo clique volta ao tamanho original.
  await bia.page.mouse.dblclick(cx, cy);
  await expect(pct).toHaveText('100%');
  expect(await transformOf(bia)).toBe('');

  // Clicar na porcentagem também volta.
  await group.getByRole('button', { name: 'Aumentar zoom' }).click();
  await group.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect(pct).toHaveText('156%');
  await pct.click();
  await expect(pct).toHaveText('100%');
});
