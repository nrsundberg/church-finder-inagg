import { Link } from "react-router";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-900 text-zinc-400 text-sm px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <p className="text-zinc-300 font-medium">
          Church Finder — SBC · Founders · 9Marks
        </p>
        <p className="text-zinc-500 leading-relaxed max-w-2xl">
          A free, independent tool that cross-references the SBC, Founders
          Ministries, and 9Marks church directories on one map — helping
          Southern Baptists find reformed, healthy churches in unfamiliar areas.
          Not affiliated with any of these organizations.
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-zinc-400">
          <Link to="/about" className="hover:text-zinc-100 transition-colors">
            About
          </Link>
          <a
            href="https://churches.sbc.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-100 transition-colors"
          >
            SBC Directory ↗
          </a>
          <a
            href="https://church.founders.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-100 transition-colors"
          >
            Founders ↗
          </a>
          <a
            href="https://www.9marks.org/church-search/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-100 transition-colors"
          >
            9Marks ↗
          </a>
        </nav>
        <p className="text-zinc-600 text-xs">
          &copy; {new Date().getFullYear()} basedchurchfinder.com
        </p>
      </div>
    </footer>
  );
}
