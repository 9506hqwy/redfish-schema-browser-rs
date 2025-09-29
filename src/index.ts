import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { html, LitElement, unsafeCSS } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import type { DirectiveResult } from "lit/directive.js";
import {
  type UnsafeHTMLDirective,
  unsafeHTML,
} from "lit/directives/unsafe-html.js";
import "./bulma.min.css";
import "./index.css";
import bulmaStyles from "./bulma.min.css?inline";
import indexStyles from "./index.css?inline";

const globalStyles = [unsafeCSS(bulmaStyles), unsafeCSS(indexStyles)];

interface RedfishModel {
  link: string;
  resource: string;
  version: string;
  fragment: string;
}

interface SearchResourceResult {
  name: string;
  model: string;
  properties: SearchPropertyResult[];
}

interface SearchPropertyResult {
  name: string;
  value?: SearchValueResult;
}

interface SearchValueResult {
  name: string;
  content: string;
}

function getCurrentPosition(): Promise<RedfishModel[]> {
  console.log("get_current_position");
  return invoke("get_current_position");
}

function getSchemas(): Promise<string[]> {
  console.log("get_schemas");
  return invoke("get_schemas");
}

function getSchemaByUrl(link: string): Promise<RedfishModel> {
  console.log(`get_schema_by_url(${link})`);
  const args = { link: link };
  return invoke("get_schema_by_url", args);
}

async function getSchemaContent(
  schema: string,
  version: string,
): Promise<unknown> {
  console.log(`get_schema_content(${schema}, ${version})`);
  const args = { schema: schema, version: version };
  const content: string = await invoke("get_schema_content", args);
  return JSON.parse(content);
}

function getSchemaVersions(schema: string): Promise<string[]> {
  console.log(`get_schemaversions(${schema})`);
  const args = { schema: schema };
  return invoke("get_schema_versions", args);
}

function resetCurrentPosition(schema: string) {
  console.log(`reset_current_position(${schema})`);
  const args = { schema: schema };
  return invoke("reset_current_position", args);
}

function search(keyword: string): Promise<SearchResourceResult[]> {
  console.log(`search(${keyword})`);
  const args = { keyword: keyword };
  return invoke("search", args);
}

function setSchemaPath(path: string) {
  console.log(`set_schema_path(${path})`);
  const args = { path: path };
  return invoke("set_schema_path", args);
}

@customElement("rsb-a")
export class RsbAnchor extends LitElement {
  static override styles = globalStyles;

  @property({ type: String })
  href: string = "";

  @property({ type: String })
  text: string = "";

  @property({ type: String })
  keyword: string = "";

  override render() {
    let text: string | DirectiveResult<typeof UnsafeHTMLDirective> = this.text;
    if (this.keyword) {
      const regex = new RegExp(this.keyword, "gi");
      text = unsafeHTML(
        (text as string).replace(regex, '<span class="keyword">$&</span>'),
      );
    }

    return html`
      <a href="${this.href}" title="${this.href}" @click="${this._click}">
        ${text}
      </a>
    `;
  }

  private _click(e: Event) {
    e.preventDefault();

    let anchor = e.target as HTMLAnchorElement;
    if (!(anchor instanceof HTMLAnchorElement)) {
      anchor = (anchor as HTMLElement).closest("a") as HTMLAnchorElement;
    }

    if (anchor.hostname !== "localhost") {
      this._linkToSchema(anchor);
    } else {
      const app = document.querySelector<RsbApp>("rsb-app")!;
      const target = app.tables!.getSectionById(anchor.hash.slice(1));
      if (target != null) {
        target.scrollIntoView();
      }
    }
  }

  private async _linkToSchema(anchor: HTMLAnchorElement): Promise<void> {
    const model = await getSchemaByUrl(anchor.href);

    const app = document.querySelector<RsbApp>("rsb-app")!;
    await app.updateContent(model);
  }
}

@customElement("rsb-search-table")
export class RsbSearchTable extends LitElement {
  static override styles = globalStyles;

  @property({ type: Array })
  resources: SearchResourceResult[] = [];

  override render() {
    const app = document.querySelector<RsbApp>("rsb-app")!;
    const regex = new RegExp(app.searcher.keyword as string, "gi");

    const rows = [];

    for (const resource of this.resources) {
      for (const property of resource.properties) {
        const name = `${resource.name}.json#/definitions/${resource.model}.${property.name}`;
        const url = `http://redfish.dmtf.org/schemas/v1/${name}`;

        let value: string | DirectiveResult<typeof UnsafeHTMLDirective> = "";
        if (property.value) {
          value = property.value.content;
        }

        if (app.searcher.keyword) {
          value = unsafeHTML(
            (value as string).replace(regex, '<span class="keyword">$&</span>'),
          );
        }

        // TODO: clear breadcrumbs.

        rows.push(html`
          <tr>
            <td>
              <rsb-a
                text="${name}"
                href="${url}"
                keyword="${app.searcher.keyword}"
                @click="${this.closeSearchModal}"
              ></rsb-a>
            </td>
            <td>${value}</td>
          </tr>
        `);
      }
    }

    return html`
      <table class="table is-fullwidth is-hoverable">
        ${rows}
      </table>
    `;
  }

  closeSearchModal() {
    const app = document.querySelector<RsbApp>("rsb-app")!;
    app.searcher.close();
  }
}

@customElement("rsb-schema-enum-table")
export class RsbSchemaEnumTable extends LitElement {
  static override styles = globalStyles;

  @property({ type: Object })
  // biome-ignore lint/suspicious/noExplicitAny: multi json object
  definition: any = null;

  override render() {
    const app = document.querySelector<RsbApp>("rsb-app")!;
    const regex = new RegExp(app.searcher.keyword as string, "gi");

    const rows = [];

    for (const value of this.definition.enum) {
      let v = value;

      const longDescription = this.definition.enumLongDescriptions?.[value];
      const description = this.definition.enumDescriptions?.[value];
      let descText = longDescription || description || "";

      if (app.searcher.keyword) {
        v = unsafeHTML(v.replace(regex, '<span class="keyword">$&</span>'));
        descText = unsafeHTML(
          descText.replace(regex, '<span class="keyword">$&</span>'),
        );
      }

      const versionAdded = this.definition.enumVersionAdded?.[value];
      const verAddText = versionAdded || "";

      const typeText = this.definition.type || "";

      rows.push(html`
        <tr>
          <td>${v}</td>
          <td>${descText}</td>
          <td>${verAddText}</td>
          <td>${typeText}</td>
        </tr>
      `);
    }

    return html`
      <table class="table is-fullwidth is-hoverable">
        <thead>
          <tr>
            <th>value</th>
            <th>description</th>
            <th>version added</th>
            <th>type</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }
}

@customElement("rsb-schema-model-table")
export class RsbSchemaModelTable extends LitElement {
  static override styles = globalStyles;

  @property({ type: String })
  modelName: string = "";

  @property({ type: Array })
  // biome-ignore lint/suspicious/noExplicitAny: multi json object
  properties: any = null;

  override render() {
    const app = document.querySelector<RsbApp>("rsb-app")!;
    const regex = new RegExp(app.searcher.keyword as string, "gi");

    const rows = [];

    for (const name in this.properties) {
      const property = this.properties[name];

      let href = property.$ref;
      if (!href) {
        if (property.items) {
          href = property.items.$ref;
        } else if (property.anyOf) {
          for (const i of property.anyOf) {
            href = i.$ref;
            if (href) {
              // TODO: first element only.
              break;
            }
          }
        }
      }

      const value = href
        ? html`<rsb-a
            text="${name}"
            href="${href}"
            keyword="${app.searcher.keyword}"
          ></rsb-a>`
        : app.searcher.keyword
          ? unsafeHTML(name.replace(regex, '<span class="keyword">$&</span>'))
          : html`${name}`;

      let descText = property.longDescription || property.description || "";

      const verAddText = property.versionAdded || "";

      const typeText = property.type || "";

      const id = `/definitions/${this.modelName}.${name}`;

      if (app.searcher.keyword) {
        descText = unsafeHTML(
          descText.replace(regex, '<span class="keyword">$&</span>'),
        );
      }

      rows.push(html`
        <tr id="${id}">
          <td>${value}</td>
          <td>${descText}</td>
          <td>${verAddText}</td>
          <td>${typeText}</td>
        </tr>
      `);
    }

    return html`
      <table class="table is-fullwidth is-hoverable">
        <thead>
          <tr>
            <th>property name</th>
            <th>description</th>
            <th>version added</th>
            <th>type</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  getRowById(id: string): HTMLElement | null {
    return (this.renderRoot as ShadowRoot)!.getElementById(id);
  }
}

@customElement("rsb-schema-tables")
export class RsbSchemaTables extends LitElement {
  static override styles = globalStyles;

  @property({ type: Array })
  // biome-ignore lint/suspicious/noExplicitAny: multi json object
  definitions: any[] = [];

  override render() {
    const sections = [];

    for (const modelName in this.definitions) {
      const definition = this.definitions[modelName];

      const desc = definition.longDescrription || definition.description || "";

      let table = null;
      if (definition.properties) {
        table = html`<rsb-schema-model-table
          .modelName="${modelName}"
          .properties="${definition.properties}"
        />`;
      } else if (definition.enum) {
        table = html`<rsb-schema-enum-table .definition="${definition}" />`;
      } else if (definition.anyOf) {
        for (const elem of definition.anyOf) {
          // TODO: `properties` only
          if (elem.properties) {
            table = html`<rsb-schema-model-table
              .modelName="${modelName}"
              .properties="${elem.properties}"
            />`;
            // TODO: first element only.
            break;
          }
        }
      }

      sections.push(html`
        <section>
          <h1 id="/definitions/${modelName}" class="title">${modelName}</h1>
          <p>${desc}</p>
          ${table}
        </section>
      `);
    }

    return html`${sections}`;
  }

  // biome-ignore lint/suspicious/noExplicitAny: multi json object
  async updateTables(content: any): Promise<void> {
    this.definitions = content.definitions;
    await this.getUpdateComplete();
  }

  getSectionById(id: string): HTMLElement | null {
    let elem = (this.renderRoot as ShadowRoot)!.getElementById(id);
    if (elem != null) {
      return elem;
    }

    for (const model of this.renderRoot.querySelectorAll<RsbSchemaModelTable>(
      "rsb-schema-model-table",
    )) {
      elem = model.getRowById(id);
      if (elem != null) {
        return elem;
      }
    }

    return null;
  }
}

@customElement("rsb-breadcrumb")
export class RsbBreadcrumb extends LitElement {
  static override styles = globalStyles;

  @property({ type: Array })
  models: RedfishModel[] = [];

  override render() {
    const items = [];

    for (const model of this.models) {
      items.push(html`
        <li>
          <rsb-a text="${model.resource}" href="${model.link}">
            ${model.resource}
          </rsb-a>
        </li>
      `);
    }

    return html`
      <nav class="breadcrumb" aria-label="breadcrumbs">
        <ul>
          ${items}
        </ul>
      </nav>
    `;
  }

  async refresh(): Promise<void> {
    const models = await getCurrentPosition();
    this.models = models;
    await this.getUpdateComplete();
  }
}

@customElement("rsb-schema-selector")
export class RsbSchemaSelector extends LitElement {
  static override styles = globalStyles;

  @property({ type: Array })
  schemas: string[] = [];

  override render() {
    const items = [];

    for (const schema of this.schemas) {
      items.push(html` <option value="${schema}">${schema}</option> `);
    }

    return html`
      <div class="select">
        <select @change="${this._changeValue}">
          ${items}
        </select>
      </div>
    `;
  }

  getSchema(): string {
    const select = this.renderRoot.querySelector<HTMLOptionElement>("select")!;
    return select.value;
  }

  async refresh(): Promise<void> {
    this.schemas = await getSchemas();
    await this.getUpdateComplete();
  }

  setSchema(schema: string) {
    const options =
      this.renderRoot.querySelectorAll<HTMLOptionElement>("option")!;
    for (const option of options) {
      if (option.value === schema) {
        option.selected = true;
      } else {
        option.selected = false;
      }
    }
  }

  private async _changeValue() {
    const select = this.renderRoot.querySelector<HTMLSelectElement>("select")!;
    await resetCurrentPosition(select.value);

    const app = document.querySelector<RsbApp>("rsb-app")!;
    await app.versions.refresh();
    await app.refresh();
  }
}

@customElement("rsb-version-selector")
export class RsbVersionSelector extends LitElement {
  static override styles = globalStyles;

  @property({ type: Array })
  // biome-ignore lint/suspicious/noExplicitAny: multi json object
  versions: any[] = [];

  override render() {
    const items = [];

    for (const version of this.versions) {
      items.push(html` <option value="${version}">${version}</option> `);
    }

    return html`
      <div class="select">
        <select @change="${this._changeValue}">
          ${items}
        </select>
      </div>
    `;
  }

  getVersion(): string {
    const select = this.renderRoot.querySelector<HTMLOptionElement>("select")!;
    return select.value;
  }

  async refresh(): Promise<void> {
    const app = document.querySelector<RsbApp>("rsb-app")!;
    const versions = await getSchemaVersions(app.schemas.getSchema());
    await this.setVersions(versions);
  }

  setVersion(version: string) {
    const options =
      this.renderRoot.querySelectorAll<HTMLOptionElement>("option")!;
    for (const option of options) {
      if (option.value === version) {
        option.selected = true;
      } else {
        option.selected = false;
      }
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: multi json object
  async setVersions(versons: any[]): Promise<void> {
    this.versions = versons;
    await this.getUpdateComplete();
  }

  private _changeValue() {
    const app = document.querySelector<RsbApp>("rsb-app")!;
    app.refresh();
  }
}

@customElement("rsb-keyword-searcher")
export class RsbKeywordSearcher extends LitElement {
  static override styles = globalStyles;

  @property({ type: String })
  keyword: string | null = "";

  searchTimer: number | null = null;

  override render() {
    return html`
      <button class="button" @click="${this.open}">Search</button>
      <!-- search keyword -->
      <div class="modal">
        <div class="modal-background"></div>
        <div class="modal-card">
          <header class="modal-card-head">
            <p class="modal-card-title">Search</p>
            <button
              class="delete"
              aria-label="close"
              @click="${this.close}"
            ></button>
          </header>
          <section class="modal-card-body">
            <div class="field">
              <div class="control">
                <input
                  name="keyword"
                  type="text"
                  class="input is-rounded"
                  placeholder="keyword... (at least 3 cahr)"
                  @keyup="${this.changeValue}"
                />
              </div>
            </div>
            <div name="search-content"></div>
          </section>
        </div>
      </div>
    `;
  }

  changeValue(e: Event) {
    e.stopPropagation();

    const keyword = (e.target as HTMLInputElement)!.value;
    if (this.keyword === keyword) {
      return;
    } else if (keyword.length < 3) {
      this.search(null);
      return;
    }

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.search(keyword);
    }, 300);
  }

  clear() {
    const content = this.renderRoot.querySelector<HTMLDivElement>(
      'div[name="search-content"]',
    )!;

    while (content.firstChild) {
      content.removeChild(content.firstChild);
    }
  }

  close() {
    console.log("close search modal");
    const modal = this.renderRoot.querySelector<HTMLDivElement>("div.modal")!;
    modal.classList.remove("is-active");
  }

  open() {
    console.log("open search modal");
    const modal = this.renderRoot.querySelector<HTMLDivElement>("div.modal")!;
    modal.classList.add("is-active");

    const searchKeywordInput = modal.querySelector<HTMLInputElement>(
      'input[name="keyword"]',
    )!;
    searchKeywordInput.focus();
  }

  async search(keyword: string | null): Promise<void> {
    this.keyword = keyword;
    this.clear();

    if (keyword) {
      const resources = await search(keyword);

      const table = document.createElement(
        "rsb-search-table",
      ) as RsbSearchTable;
      table.resources = resources;

      const content = this.renderRoot.querySelector<HTMLDivElement>(
        'div[name="search-content"]',
      )!;
      content.appendChild(table);
    }
  }
}

@customElement("rsb-app")
export class RsbApp extends LitElement {
  static override styles = globalStyles;

  @query("rsb-breadcrumb")
  breadcrumb!: RsbBreadcrumb;

  @query("rsb-schema-selector")
  schemas!: RsbSchemaSelector;

  @query("rsb-version-selector")
  versions!: RsbVersionSelector;

  @query("rsb-keyword-searcher")
  searcher!: RsbKeywordSearcher;

  @query("rsb-schema-tables")
  tables!: RsbSchemaTables | null;

  override render() {
    return html`
      <rsb-breadcrumb></rsb-breadcrumb>
      <div class="field level">
        <div class="level-left">
          <div class="control level-item">
            <rsb-schema-selector></rsb-schema-selector>
          </div>
          <div class="control level-item">
            <rsb-version-selector></rsb-version-selector>
          </div>
        </div>
        <div class="level-right">
          <div class="control level-item">
            <rsb-keyword-searcher></rsb-keyword-searcher>
          </div>
        </div>
      </div>
      <div>
        <rsb-schema-tables />
      </div>
      <div class="file">
        <label class="file-label">
          <input class="file-input" type="file" @click="${this._openDialog}" />
          <span class="file-cta">
            <span class="file-label"> Choose a json schema directory. </span>
          </span>
        </label>
      </div>
    `;
  }

  async refresh(anchor?: string): Promise<void> {
    const content = await getSchemaContent(
      this.schemas.getSchema(),
      this.versions.getVersion(),
    );

    await this.breadcrumb.refresh();

    await this.tables!.updateTables(content);

    (this.renderRoot.querySelector("div.file")! as HTMLElement).style.display =
      "none";

    const linkTo = anchor || `/definitions/${this.schemas.getSchema()}`;
    const target = this.tables!.getSectionById(linkTo);
    if (target != null) {
      target.scrollIntoView();
    }
  }

  async updateContent(model: RedfishModel): Promise<void> {
    this.schemas.setSchema(model.resource);

    await this.versions.refresh();
    this.versions.setVersion(model.version);

    await this.refresh(model.fragment);
  }

  private async _openDialog(e: Event): Promise<void> {
    e.preventDefault();

    const args = {
      directory: true,
      title: "Select json schema directory",
    };
    const path = await open(args);

    await setSchemaPath(path as string);
    await this.performUpdate();
    await this.getUpdateComplete();

    await this.schemas.refresh();
    this.schemas.setSchema("ServiceRoot");

    await this.versions.refresh();

    await this.refresh();
  }
}
