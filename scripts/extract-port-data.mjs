import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function wikiSlugToId(slug) {
  return slug.toLowerCase().replace(/_/g, "-");
}

function extractWikiLinks(html) {
  const links = [];
  const re = /href="\/wiki\/([^"#]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (
      slug.startsWith("Tattoo_of_") ||
      slug.startsWith("Journey_Tattoo") ||
      slug.startsWith("Runegraft_of")
    ) {
      links.push(slug);
    }
  }
  return [...new Set(links)];
}

function extractTattooPorts(html) {
  const tableStart = html.indexOf("<h2><span class=\"mw-headline\" id=\"Table_of_tattoos\">");
  if (tableStart === -1) throw new Error("Tattoo table not found");

  const tableHtml = html.slice(tableStart);
  const tableEnd = tableHtml.indexOf("</table>");
  const table = tableHtml.slice(0, tableEnd);

  const ports = [
    { id: "ngakanu", name: "Ngakanu", attribute: "Strength", colStart: 1, colEnd: 6 },
    { id: "te-onui", name: "Te Onui", attribute: "Dexterity", colStart: 6, colEnd: 11 },
    { id: "mota-aro", name: "Mota Aro", attribute: "Intelligence", colStart: 11, colEnd: 16 },
  ];

  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  const itemPortMap = {};
  let isHeader = true;

  let rowMatch;
  while ((rowMatch = rowRe.exec(table)) !== null) {
    const row = rowMatch[1];
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (row.includes("<th>Arohongui") || row.includes("<th>Kitava")) {
      // tribe header row with th in first cell
    }

    let col = 0;
    const cellRe = /<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(row)) !== null) {
      const attrs = cellMatch[2];
      const content = cellMatch[3];
      const colspan = attrs.match(/colspan="(\d+)"/);
      const span = colspan ? Number(colspan[1]) : 1;
      const links = extractWikiLinks(content);
      if (links.length > 0) {
        const port = ports.find((p) => col >= p.colStart && col < p.colEnd);
        if (port) {
          for (const slug of links) {
            itemPortMap[wikiSlugToId(slug)] = port.id;
          }
        }
      }
      col += span;
    }
  }

  return {
    ports: ports.map(({ id, name, attribute }) => ({ id, name, attribute })),
    items: itemPortMap,
  };
}

function extractRunegraftPorts(html) {
  const marker = "<th>Riben Fell (DEX)</th>";
  const tableStart = html.indexOf(marker);
  if (tableStart === -1) throw new Error("Runegraft port table not found");

  const before = html.slice(0, tableStart);
  const tableOpen = before.lastIndexOf("<table");
  const tableEnd = html.indexOf("</table>", tableStart);
  const table = html.slice(tableOpen, tableEnd);

  const portDefs = [
    { id: "riben-fell", name: "Riben Fell", attribute: "Dexterity" },
    { id: "pondium", name: "Pondium", attribute: "Intelligence" },
    { id: "kalguur", name: "Kalguur", attribute: "Strength" },
  ];

  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  const itemPortMap = {};
  const anyItems = [];
  let headerSkipped = false;

  let rowMatch;
  while ((rowMatch = rowRe.exec(table)) !== null) {
    const row = rowMatch[1];
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }

    const cellRe = /<td>([\s\S]*?)<\/td>/g;
    let col = 0;
    let cellMatch;
    while ((cellMatch = cellRe.exec(row)) !== null) {
      const links = extractWikiLinks(cellMatch[1]);
      if (col < portDefs.length) {
        const port = portDefs[col];
        for (const slug of links) {
          itemPortMap[wikiSlugToId(slug)] = port.id;
        }
      } else {
        for (const slug of links) {
          anyItems.push(wikiSlugToId(slug));
        }
      }
      col++;
    }
  }

  return {
    ports: portDefs,
    items: itemPortMap,
    anyItems: [...new Set(anyItems)],
  };
}

const tattooHtml = await fs.readFile(path.join(root, "temp", "tattoo.html"), "utf8");
const runegraftHtml = await fs.readFile(path.join(root, "temp", "runegraft.html"), "utf8");

const tattooData = extractTattooPorts(tattooHtml);
const runegraftData = extractRunegraftPorts(runegraftHtml);

const output = {
  tattoo: {
    shipmentValue: 100_000,
    ports: tattooData.ports,
    items: tattooData.items,
  },
  runegraft: {
    shipmentValue: 400_000,
    ports: runegraftData.ports,
    items: runegraftData.items,
    anyItems: runegraftData.anyItems,
  },
};

await fs.writeFile(
  path.join(root, "kingsmarch.ports.json"),
  JSON.stringify(output, null, 2) + "\n"
);

console.log(`Tattoo ports: ${tattooData.ports.length}, items mapped: ${Object.keys(tattooData.items).length}`);
console.log(`Runegraft ports: ${runegraftData.ports.length}, items mapped: ${Object.keys(runegraftData.items).length}, any: ${runegraftData.anyItems.length}`);
