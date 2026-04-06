export async function handleGetDocumentInfo() {
  const root = figma.root;
  const pages = root.children.map((page) => ({
    id: page.id,
    name: page.name,
  }));

  return {
    fileName: root.name,
    currentPage: {
      id: figma.currentPage.id,
      name: figma.currentPage.name,
    },
    pages,
    pageCount: pages.length,
  };
}
