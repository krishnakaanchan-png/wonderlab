import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Terminal, Workflow } from "lucide-react";
export default function Integrations() {
  return (
    <main className="integration-page">
      <header>
        <Link href="/">
          <ArrowLeft size={17} /> Back to WonderLab
        </Link>
        <span>WonderLab for agents</span>
      </header>
      <section className="integration-intro">
        <div>
          <h1>Visual tools for your agent.</h1>
          <p>
            Turn a prompt or picture into an animated project, check its
            progress, and open the result in the studio.
          </p>
          <a href="#connect" className="primary">
            Connect your workflow <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="workflow-preview">
          <Workflow size={27} />
          <ol>
            <li>
              <strong>Your agent</strong>
              <span>A prompt or an image</span>
            </li>
            <li>
              <strong>WonderLab MCP</strong>
              <span>Plan · generate · check progress</span>
            </li>
            <li>
              <strong>An interactive project</strong>
              <span>Open, inspect, and explore</span>
            </li>
          </ol>
        </div>
      </section>
      <section className="integration-section" id="connect">
        <h2>Run beside your agent</h2>
        <p>
          The MCP prototype runs from the project source. Choose stdio for a
          local agent, or authenticated Streamable HTTP for a service. The
          hosted studio is the viewer; it does not host this standalone MCP
          process.
        </p>
        <div className="connection-options">
          <article>
            <Terminal size={20} />
            <h3>Local · stdio</h3>
            <p>
              Provide <code>MODEL_API_KEY</code> in the server environment. Run
              from the WonderLab source directory.
            </p>
            <pre>
              <code>{`npm install\nnpm run --silent mcp`}</code>
            </pre>
            <p>
              In your MCP client, use <code>node</code> with arguments{" "}
              <code>--import tsx mcp/server.ts</code> and the project directory
              as its working directory.
            </p>
          </article>
          <article>
            <Workflow size={20} />
            <h3>Service · HTTP</h3>
            <p>
              Set a separate <code>WONDERLAB_MCP_TOKEN</code> of at least 24
              characters, then start the server.
            </p>
            <pre>
              <code>{`npm run mcp:http\n# http://127.0.0.1:4318/mcp`}</code>
            </pre>
            <p>
              Send <code>Authorization: Bearer …</code>. For a remote
              deployment, place it behind HTTPS and configure the public URL and
              allowed origins.
            </p>
          </article>
        </div>
      </section>
      <section className="integration-section">
        <h2>A small, composable toolset</h2>
        <div className="tool-table">
          <div>
            <code>list_examples</code>
            <p>
              Inspect the available example projects without calling a model.
            </p>
          </div>
          <div>
            <code>plan_animation</code>
            <p>
              Ask Muse Wonder to interpret a picture and propose a teaching
              sequence.
            </p>
          </div>
          <div>
            <code>create_visualization</code>
            <p>
              Start a cutaway or 3D generation job. Receive its ID immediately.
            </p>
          </div>
          <div>
            <code>get_job</code>
            <p>
              Check progress, then get the project file path or authenticated
              download URL.
            </p>
          </div>
          <div>
            <code>get_manifest</code>
            <p>
              Read components, stages, controls, and assumptions without large
              image payloads.
            </p>
          </div>
        </div>
      </section>
      <section className="integration-section">
        <h2>Bring the result into the studio</h2>
        <p>
          Download the completed project JSON, choose{" "}
          <strong>Open project</strong> in WonderLab, and select the file. The
          animation, controls, and teaching stages travel together.
        </p>
        <p className="integration-note">
          This is a single-tenant prototype using MCP 2025-11-25. One generation
          runs at a time. Completed results persist on disk; interrupted jobs
          require a retry. Generation uses your Meta API allowance. Full setup,
          an example client, and tests are included in the source under{" "}
          <code>mcp/</code>.
        </p>
      </section>
    </main>
  );
}
