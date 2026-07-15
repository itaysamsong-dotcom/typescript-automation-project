import { urlPaths } from "../config/routes";
import { basePage as test, expect } from "../fixtures/basePage";
import { searchItemsByNameUnderPrice } from "../utils/productUtils";

test.describe("product search tests", () => {
  test.use({ pagePath: urlPaths.home });

  test("finds pliers under the maximum price", async ({ page }) => {
    const resultLimit = 5;
    const urls = await searchItemsByNameUnderPrice(
      page,
      "Pliers",
      15,
      resultLimit,
    );

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.length).toBeLessThanOrEqual(resultLimit);
    for (const url of urls) {
      expect(url).toMatch(
        /^https:\/\/practicesoftwaretesting\.com\/product\//,
      );
    }
  });
});
