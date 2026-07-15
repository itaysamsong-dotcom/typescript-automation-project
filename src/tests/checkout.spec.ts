import { productPage as test } from "../fixtures/ProductPage";
import { loginUsers } from "../testData/loginTestData";
import { products } from "../testData/productTestData";
import { billingAddress } from "../testData/registerTestData";
import {
  addItemsToCart,
  checkProductCreation,
  proceedToCheckout,
} from "../utils/checkoutUtils";

test.describe("Shopping working tools tests", () => {
  test.use({ product: products.CombinationPliers });

  test("buying a new product will save the product invoices", async ({
    page,
    product,
    productId,
  }) => {
    await addItemsToCart(page, productId, product);
    await proceedToCheckout(page, loginUsers.approved, billingAddress);
    await checkProductCreation(page);
  });
});
