import { expect, type Page, type Response } from "@playwright/test";
import { baseUrls, urlPaths } from "../config/routes";
import { checkoutLabels, checkoutSelectors } from "../mapping/checkout";
import { productsSelectors } from "../mapping/productMapping";
import type { InvoiceResponse } from "../models/checkoutTypes";
import type { LoginDetailsType } from "../models/loginTypes";
import type { productType } from "../models/productTypes";
import type { BillingAddress } from "../models/registerTypes";
import { endpoint } from "./commonUtils";
import { loginUser } from "./loginUtils";
import { fillBillingAddress } from "./registerUtils";

export async function addItemsToCart(
  page: Page,
  productId: string,
  product: productType,
) {
  await expect(page).toHaveURL(endpoint(`${urlPaths.product}/${productId}`));
  await expect(page.getByTestId(productsSelectors.productName)).toHaveText(
    product.name,
  );
  await expect(page.getByTestId(productsSelectors.unitPrice)).toHaveText(
    product.unitPrice.toString(),
  );
  await expect(page.getByTestId(productsSelectors.quantity)).toHaveValue("1");

  await page.getByTestId(productsSelectors.increaseQuantity).click();
  await expect(page.getByTestId(productsSelectors.quantity)).toHaveValue("2");

  const addItemResponsePromise = page.waitForResponse(isAddItemResponse);
  await page.getByTestId(productsSelectors.addToCart).click();
  const addItemResponse = await addItemResponsePromise;

  if (!addItemResponse.ok()) {
    throw new Error(
      `Adding the product to the cart failed with status ${addItemResponse.status()}.`,
    );
  }
}

function isAddItemResponse(response: Response): boolean {
  const url = new URL(response.url());
  return (
    response.request().method() === "POST" &&
    url.origin === baseUrls.api &&
    /^\/carts\/[^/]+$/.test(url.pathname)
  );
}

export async function assertCartTotalNotExceeds(
  page: Page,
  budgetPerItem: number,
  itemsCount: number,
): Promise<void> {
  await page.goto(urlPaths.checkout);
  await expect(page).toHaveURL(endpoint(urlPaths.checkout));

  const cartTotal = page.getByTestId(checkoutSelectors.cartTotal);
  await expect(cartTotal).toBeVisible();

  const displayedTotal = await cartTotal.innerText();
  const total = Number(displayedTotal.replace(/[^\d.,-]/g, "").replace(",", "."));
  const maximumTotal = budgetPerItem * itemsCount;

  expect(
    Number.isFinite(total),
    `Could not parse the cart total from "${displayedTotal}".`,
  ).toBe(true);

  await page.screenshot({ path: "test-results/cart-total.png", fullPage: true });

  expect(
    total,
    `Cart total ${total} exceeds the allowed total ${maximumTotal}.`,
  ).toBeLessThanOrEqual(maximumTotal);
}

export async function proceedToCheckout(
  page: Page,
  loginDetails: LoginDetailsType,
  billingAddress: BillingAddress,
) {
  await page.goto(urlPaths.checkout);
  await expect(page).toHaveURL(endpoint(urlPaths.checkout));
  await page.getByTestId(checkoutSelectors.proceedToLogin).click();
  await loginUser(page, loginDetails);
  await page.getByTestId(checkoutSelectors.proceedToBillingAddress).click();
  await fillBillingAddress(page, billingAddress);
  await page.getByTestId(checkoutSelectors.proceedToPayment).click();

  const paymentMethod = page.getByTestId(checkoutSelectors.paymentMethod);
  await paymentMethod.selectOption({ label: checkoutLabels.cashPaymentMethod });
  await page.getByTestId(checkoutSelectors.proceedToFinishCheckout).click();
  await expect(
    page.getByTestId(checkoutSelectors.paymentSuccessMessage),
  ).toBeVisible();
}

export async function waitForInvoiceResponse(
  page: Page,
): Promise<InvoiceResponse> {
  const response = await page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.origin === baseUrls.api &&
      url.pathname === urlPaths.invoices
    );
  });
  if (!response.ok()) {
    throw new Error(`Invoice request failed with status ${response.status()}.`);
  }
  return response.json() as Promise<InvoiceResponse>;
}

export async function checkProductCreation(page: Page) {
  const invoiceResponsePromise = waitForInvoiceResponse(page);
  await page.getByTestId(checkoutSelectors.proceedToFinishCheckout).click();
  const invoice = await invoiceResponsePromise;

  await expect(page.locator(checkoutSelectors.invoiceNumber)).toHaveText(
    invoice.invoice_number,
  );
}
