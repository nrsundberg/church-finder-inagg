import assert from "node:assert/strict";
import test from "node:test";
import { parseFoundersArticle } from "./founders";

// Minimal fragment matching live church.founders.org listing HTML (see employers-wrapper / employer-card)
const SINGLE_ARTICLE = `<article id="post-5183" class="map-item employer-card post-5183 employer type-employer" data-latitude="26.641832" data-longitude="-82.0009441">
    <div class="employer-list v1 layout-employer">
            <div class="info-employer">
                    <div class="title-wrapper">
                                                <h2 class="employer-title">
                            <a href="https://church.founders.org/church/grace-baptist-church/" rel="bookmark">
                                Grace Baptist Church                            </a>
                        </h2>
                    </div>
                    <div class="employer-metas">
                        <div class="employer-location">
	            	<div class="value">
			                <a href="https://church.founders.org/church-location/florida/">Florida</a>
	            </div>
        	</div>
                    </div>
                </div>
    </div>
</article>`;

test("parseFoundersArticle extracts fields from a listing article", () => {
  const c = parseFoundersArticle(SINGLE_ARTICLE);
  assert.ok(c);
  assert.equal(c!.sourceId, "5183");
  assert.equal(c!.name, "Grace Baptist Church");
  assert.equal(c!.lat, 26.641832);
  assert.equal(c!.lng, -82.0009441);
  assert.equal(c!.state, "FL");
  assert.equal(c!.profileUrl, "https://church.founders.org/church/grace-baptist-church/");
});
