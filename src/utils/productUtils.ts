import { request, type Page, type Response } from "@playwright/test";
import { baseUrls, urlPaths } from "../config/routes";
import { productsSelectors } from "../mapping/productMapping";

function isProductsResponse(response: Response): boolean {
  const url = new URL(response.url());
  return (
    ["GET", "QUERY"].includes(response.request().method()) &&
    url.origin === baseUrls.api &&
    url.pathname.startsWith(urlPaths.productsApi)
  );
}

async function waitForProductsResponse(page: Page): Promise<void> {
  const response = await page.waitForResponse(isProductsResponse, {
    timeout: 10_000,
  });
  if (!response.ok()) {
    throw new Error(`Product search failed with status ${response.status()}.`);
  }
}

async function applyMaximumPriceFilter(
  page: Page,
  maxPrice: number,
): Promise<void> {
  const nativeRanges = page.locator(productsSelectors.nativePriceRange);
  const nativeRangeCount = await nativeRanges.count();

  if (nativeRangeCount > 0) {
    const maximumRange = nativeRanges.nth(nativeRangeCount - 1);
    const responsePromise = waitForProductsResponse(page);
    await maximumRange.evaluate((element, requestedPrice) => {
      const input = element as HTMLInputElement;
      const minimum = Number(input.min || 0);
      const maximum = Number(input.max || requestedPrice);
      input.value = String(Math.min(maximum, Math.max(minimum, requestedPrice)));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, maxPrice);
    await responsePromise;
    return;
  }

  const sliders = page.locator(productsSelectors.accessiblePriceSlider);
  const sliderCount = await sliders.count();
  if (sliderCount === 0) return;

  const maximumSlider = sliders.nth(sliderCount - 1);
  const minimum = Number((await maximumSlider.getAttribute("aria-valuemin")) ?? 0);
  const maximum = Number(
    (await maximumSlider.getAttribute("aria-valuemax")) ?? maxPrice,
  );
  const step = Number((await maximumSlider.getAttribute("aria-valuestep")) ?? 1);
  const target = Math.min(maximum, Math.max(minimum, maxPrice));
  await maximumSlider.focus();

  let responsePromise = waitForProductsResponse(page);
  await maximumSlider.press("Home");
  await responsePromise;

  let currentValue = Number(
    (await maximumSlider.getAttribute("aria-valuenow")) ?? minimum,
  );

  while (currentValue < target) {
    responsePromise = waitForProductsResponse(page);
    await maximumSlider.press("ArrowRight");
    await responsePromise;

    const nextValue = Number(
      (await maximumSlider.getAttribute("aria-valuenow")) ?? currentValue + step,
    );
    if (nextValue <= currentValue) {
      throw new Error("The maximum-price slider did not advance.");
    }
    currentValue = nextValue;
  }
}

export async function searchItemsByNameUnderPrice(
  page: Page,
  query: string,
  maxPrice: number,
  limit = 5,
): Promise<string[]> {
  if (maxPrice < 0) {
    throw new RangeError("maxPrice must be greater than or equal to zero.");
  }
  if (limit <= 0) return [];

  await page.getByTestId(productsSelectors.search).fill(query);
  const searchResponsePromise = waitForProductsResponse(page);
  await page.getByTestId(productsSelectors.submit).click();
  await searchResponsePromise;
  await applyMaximumPriceFilter(page, maxPrice);

  const urls = new Set<string>();

  while (urls.size < limit) {
    const productLinks = page.locator(
      `xpath=${productsSelectors.productLinkXPath}`,
    );
    const productCount = await productLinks.count();

    for (let index = 0; index < productCount && urls.size < limit; index += 1) {
      const productLink = productLinks.nth(index);
      const price = productLink
        .locator(`xpath=.//*[@data-test="${productsSelectors.productPrice}"]`)
        .or(
          productLink.locator(
            `xpath=ancestor::*[.//*[@data-test="${productsSelectors.productPrice}"]][1]//*[@data-test="${productsSelectors.productPrice}"]`,
          ),
        )
        .first();
      const priceText = await price.textContent();
      const parsedPrice = Number(priceText?.replace(/[^\d.-]/g, ""));
      const href = await productLink.getAttribute("href");

      if (href && Number.isFinite(parsedPrice) && parsedPrice <= maxPrice) {
        urls.add(new URL(href, page.url()).href);
      }
    }

    if (urls.size >= limit) break;

    const next = page.getByTestId(productsSelectors.paginationNext);
    if ((await next.count()) === 0) break;

    const nextClasses = (await next.getAttribute("class"))?.split(/\s+/) ?? [];
    const parentClasses =
      (await next.locator("xpath=..").getAttribute("class"))?.split(/\s+/) ?? [];
    const nextIsDisabled =
      (await next.isDisabled()) ||
      (await next.getAttribute("aria-disabled")) === "true" ||
      nextClasses.includes("disabled") ||
      parentClasses.includes("disabled");
    if (nextIsDisabled) break;

    const nextResponsePromise = waitForProductsResponse(page);
    await next.click();
    await nextResponsePromise;
  }

  return [...urls].slice(0, limit);
}

export async function getProductIdByName(productName: string): Promise<string> {
  const apiContext = await request.newContext({ baseURL: baseUrls.api });

  try {
    const response = await apiContext.get(`${urlPaths.productsApi}`);
    const json = await response.json();
    const product = json.data.find(
      (p: { name: string; id: string }) =>
        p.name.toLowerCase() === productName.toLowerCase(),
    );

    if (!product) {
      throw new Error(`Product "${productName}" not found`);
    }
    return product.id;
  } finally {
    await apiContext.dispose();
  }
}
