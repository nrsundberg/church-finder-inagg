import { Link } from "react-router";
import type { Route } from "./+types/about";

export const meta: Route.MetaFunction = () => [
  { title: "About — Church Finder | SBC, Founders & 9Marks" },
  {
    name: "description",
    content:
      "Learn how Church Finder cross-references the SBC, Founders Ministries, and 9Marks church directories to help Southern Baptists find reformed, healthy churches.",
  },
  { property: "og:title", content: "About — Church Finder | SBC, Founders & 9Marks" },
  {
    property: "og:description",
    content:
      "Learn how Church Finder cross-references the SBC, Founders Ministries, and 9Marks church directories to help Southern Baptists find reformed, healthy churches.",
  },
  { rel: "canonical", href: "https://basedchurchfinder.com/about" },
];

export default function About() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/" className="text-lg font-bold hover:text-zinc-300 transition-colors">
              Church Finder
            </Link>
            <p className="text-xs text-zinc-500">SBC · Founders · 9Marks</p>
          </div>
          <Link
            to="/"
            className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            ← Search
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 space-y-12">
        {/* What is this */}
        <section className="space-y-4">
          <h1 className="text-3xl font-bold">What is Church Finder?</h1>
          <p className="text-zinc-300 leading-relaxed">
            Church Finder is a free, independent tool that puts three church
            directories — the Southern Baptist Convention, Founders Ministries,
            and 9Marks — on one map. You can search by location, filter by
            radius, and see at a glance which churches appear in one, two, or
            all three directories.
          </p>
          <p className="text-zinc-300 leading-relaxed">
            If you&rsquo;re a Southern Baptist who&rsquo;s relocating, visiting
            a new city, or simply want to find a church that is both SBC-affiliated
            and committed to reformed theology and biblical church health, this
            tool surfaces that overlap in one place. The SBC alone has over
            37,000 member churches with a wide range of theological distinctives.
            Founders and 9Marks each curate far smaller lists of churches with
            specific commitments. A church that appears in all three directories
            is a meaningful signal.
          </p>
          <p className="text-zinc-500 text-sm border-l-2 border-zinc-700 pl-4">
            This site is not affiliated with the Southern Baptist Convention,
            Founders Ministries, or 9Marks. It aggregates their publicly
            available directories independently.
          </p>
        </section>

        {/* How to read results */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">How to read the results</h2>
          <p className="text-zinc-400">
            Church markers are color-coded by how many directories list them:
          </p>
          <ul className="space-y-2 text-sm">
            {[
              { color: "bg-[#ef4444]", label: "SBC only" },
              { color: "bg-[#f59e0b]", label: "Founders only" },
              { color: "bg-[#8b5cf6]", label: "9Marks only" },
              { color: "bg-[#3b82f6]", label: "2 sources" },
              { color: "bg-[#10b981]", label: "All 3 sources" },
            ].map(({ color, label }) => (
              <li key={label} className="flex items-center gap-2">
                <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
                <span className="text-zinc-300">{label}</span>
              </li>
            ))}
          </ul>
          <p className="text-zinc-400 text-sm">
            Use the <strong className="text-zinc-300">"2+ sources"</strong> or{" "}
            <strong className="text-zinc-300">"All 3 sources"</strong> filter to
            narrow results to churches with the strongest cross-directory signal.
          </p>
        </section>

        {/* SBC */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">
            Southern Baptist Convention (SBC)
          </h2>
          <p className="text-zinc-300 leading-relaxed">
            The Southern Baptist Convention is the largest Protestant
            denomination in the United States, with over 37,000 affiliated
            churches. Member churches are autonomous — each is independent and
            self-governing — and cooperate voluntarily through the{" "}
            <a
              href="https://www.sbc.net/cp/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Cooperative Program
            </a>{" "}
            to fund missions, church planting, and theological education. The
            SBC&rsquo;s doctrinal standard is the{" "}
            <a
              href="https://bfm.sbc.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Baptist Faith &amp; Message
            </a>
            .
          </p>
          <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400">
            <p>
              &ldquo;Southern Baptists are not a <em>creedal</em> people,
              requiring churches or individuals to embrace a standardized set of
              beliefs; but we are a <em>confessional</em> people.&rdquo;
            </p>
            <footer className="mt-2 text-sm not-italic">
              &mdash;{" "}
              <a
                href="https://www.sbc.net/about/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-300 underline"
              >
                sbc.net/about/
              </a>
            </footer>
          </blockquote>
          <p className="text-zinc-400 text-sm">
            Directory:{" "}
            <a
              href="https://churches.sbc.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              churches.sbc.net ↗
            </a>
          </p>
        </section>

        {/* Founders */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Founders Ministries</h2>
          <p className="text-zinc-300 leading-relaxed">
            Founders Ministries is a ministry within the Southern Baptist
            tradition committed to the recovery of the gospel and the
            reformation of churches according to the Doctrines of Grace and the
            historic{" "}
            <a
              href="https://founders.org/1689lbcf/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              1689 Baptist Confession of Faith
            </a>
            . Churches listed in the Founders directory have affirmed reformed
            theology — including the sovereignty of God in salvation — and are
            generally within the SBC or its network.
          </p>
          <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400">
            <p>
              &ldquo;For the Recovery of the Gospel and Reformation of
              Churches.&rdquo;
            </p>
            <footer className="mt-2 text-sm not-italic">
              &mdash;{" "}
              <a
                href="https://founders.org/about/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-300 underline"
              >
                founders.org/about/
              </a>
            </footer>
          </blockquote>
          <p className="text-zinc-400 text-sm">
            Directory:{" "}
            <a
              href="https://church.founders.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              church.founders.org ↗
            </a>
          </p>
        </section>

        {/* 9Marks */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">9Marks</h2>
          <p className="text-zinc-300 leading-relaxed">
            9Marks is a ministry that helps pastors and church members build
            healthy churches by focusing on nine marks of a healthy church.
            Their church search directory lists churches that have affirmed these
            commitments, particularly around expositional preaching, biblical
            church membership and discipline, and plural eldership.
          </p>
          <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400">
            <p>
              &ldquo;Equipping church leaders with a biblical vision and
              practical resources for displaying God&rsquo;s glory to the
              nations through healthy churches.&rdquo;
            </p>
            <footer className="mt-2 text-sm not-italic">
              &mdash;{" "}
              <a
                href="https://www.9marks.org/about/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-300 underline"
              >
                9marks.org/about/
              </a>
            </footer>
          </blockquote>
          <p className="text-zinc-400 text-sm font-medium mb-2">
            The nine marks:
          </p>
          <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
            <li>Expositional Preaching</li>
            <li>Gospel Doctrine</li>
            <li>Conversion and Evangelism</li>
            <li>Church Membership</li>
            <li>Church Discipline</li>
            <li>Discipleship and Growth</li>
            <li>Church Leadership (plural eldership)</li>
            <li>Prayer</li>
            <li>Missions</li>
          </ol>
          <p className="text-zinc-400 text-sm">
            Directory:{" "}
            <a
              href="https://www.9marks.org/church-search/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              9marks.org/church-search ↗
            </a>
          </p>
        </section>

        <div className="pt-4">
          <Link
            to="/"
            className="inline-block bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Search for churches →
          </Link>
        </div>
      </main>
    </div>
  );
}
