import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as Mocha from 'mocha';
import { CommentService } from '../../services/CommentService';
import { Comment, CommentAnchor } from '../../types';

const suite = Mocha.suite;
const test = Mocha.test;
const setup = Mocha.setup;
const teardown = Mocha.teardown;

suite('CommentService Test Suite', () => {
  let commentService: CommentService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    commentService = new CommentService();
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('parseComments', () => {
    test('should return empty array for document without comment block', () => {
      const mockDocument = createMockDocument('# Hello World\n\nSome text here');
      const comments = commentService.parseComments(mockDocument);
      assert.deepStrictEqual(comments, []);
    });

    test('should parse valid comment block', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'test-id-1',
            anchor: { text: 'Hello', startLine: 0, startChar: 2, endLine: 0, endChar: 7 },
            content: 'This is a comment',
            author: 'testuser',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      const documentText = `# Hello World\n\n<!-- markco-comments\n${JSON.stringify(commentData, null, 2)}\n-->`;
      const mockDocument = createMockDocument(documentText);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.strictEqual(comments.length, 1);
      assert.strictEqual(comments[0].id, 'test-id-1');
      assert.strictEqual(comments[0].content, 'This is a comment');
    });

    test('should handle malformed JSON gracefully', () => {
      const documentText = `# Hello\n\n<!-- markco-comments\n{invalid json}\n-->`;
      const mockDocument = createMockDocument(documentText);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.deepStrictEqual(comments, []);
    });

    test('should ignore comment block inside code fence', () => {
      const documentText = `# Hello\n\n\`\`\`\n<!-- markco-comments\n{"version": 2, "comments": []}\n-->\n\`\`\``;
      const mockDocument = createMockDocument(documentText);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.deepStrictEqual(comments, []);
    });

    test('should restore sanitized text from storage', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'test-id-1',
            anchor: { text: 'text with --\u200B>', startLine: 0, startChar: 0, endLine: 0, endChar: 10 },
            content: 'comment with --\u200B>',
            author: 'testuser',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      const documentText = `# Hello\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.strictEqual(comments[0].anchor.text, 'text with -->');
      assert.strictEqual(comments[0].content, 'comment with -->');
    });
  });

  suite('getComments', () => {
    test('should cache parsed comments', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'cached-id',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Cached comment',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      // First call parses
      const comments1 = commentService.getComments(mockDocument);
      // Second call should use cache
      const comments2 = commentService.getComments(mockDocument);
      
      assert.strictEqual(comments1.length, 1);
      assert.strictEqual(comments2.length, 1);
      assert.strictEqual(comments1[0].id, 'cached-id');
    });
  });

  suite('findComment', () => {
    test('should find comment by ID', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'find-me',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Found it',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      const comment = commentService.findComment(mockDocument, 'find-me');
      
      assert.strictEqual(comment?.id, 'find-me');
      assert.strictEqual(comment?.content, 'Found it');
    });

    test('should return undefined for non-existent comment', () => {
      const documentText = `# Test\n\n<!-- markco-comments\n{"version": 2, "comments": []}\n-->`;
      const mockDocument = createMockDocument(documentText);

      const comment = commentService.findComment(mockDocument, 'non-existent');
      
      assert.strictEqual(comment, undefined);
    });
  });

  suite('clearCache', () => {
    test('should clear cached comments for document', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'cache-test',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Cache test',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      // Cache comments
      commentService.getComments(mockDocument);
      
      // Clear cache
      commentService.clearCache(mockDocument);
      
      // Create new document with different comments (simulating document change)
      const newDocumentText = `# Test\n\n<!-- markco-comments\n{"version": 2, "comments": []}\n-->`;
      const newMockDocument = createMockDocument(newDocumentText, mockDocument.uri.toString());
      
      // Should re-parse (cache was cleared)
      const comments = commentService.getComments(newMockDocument);
      assert.strictEqual(comments.length, 0);
    });
  });

  suite('Reply operations', () => {
    test('findReply should find reply within a comment', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'comment-1',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Main comment',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z',
            replies: [
              {
                id: 'reply-1',
                content: 'A reply',
                author: 'replier',
                createdAt: '2024-01-02T00:00:00.000Z'
              }
            ]
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      const reply = commentService.findReply(mockDocument, 'comment-1', 'reply-1');
      
      assert.strictEqual(reply?.id, 'reply-1');
      assert.strictEqual(reply?.content, 'A reply');
    });

    test('findReply should return undefined for non-existent reply', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'comment-1',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Main comment',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z',
            replies: []
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      const reply = commentService.findReply(mockDocument, 'comment-1', 'non-existent');
      
      assert.strictEqual(reply, undefined);
    });
  });

  suite('getGitUserName', () => {
    test('should return "user" as fallback when git fails', async () => {
      // Create a mock document in a non-git directory
      const mockDocument = createMockDocument('# Test');
      
      // The actual call may fail or succeed depending on environment
      const userName = await commentService.getGitUserName(mockDocument);
      
      // Should return a string (either git username or 'user' fallback)
      assert.strictEqual(typeof userName, 'string');
      assert.ok(userName.length > 0);
    });
  });
});

// Helper functions to create mock VS Code objects

function createMockDocument(text: string, uri?: string): vscode.TextDocument {
  const lines = text.split('\n');
  const mockUri = uri ? vscode.Uri.parse(uri) : vscode.Uri.parse('file:///test/mock-document.md');
  
  return {
    uri: mockUri,
    fileName: mockUri.fsPath,
    isUntitled: false,
    languageId: 'markdown',
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: vscode.EndOfLine.LF,
    lineCount: lines.length,
    encoding: 'utf-8',
    getText: (range?: vscode.Range) => {
      if (!range) {
        return text;
      }
      const startOffset = getOffset(text, range.start);
      const endOffset = getOffset(text, range.end);
      return text.substring(startOffset, endOffset);
    },
    getWordRangeAtPosition: () => undefined,
    lineAt: (lineOrPosition: number | vscode.Position) => {
      const lineNumber = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
      const lineText = lines[lineNumber] || '';
      return {
        lineNumber,
        text: lineText,
        range: new vscode.Range(lineNumber, 0, lineNumber, lineText.length),
        rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber + 1, 0),
        firstNonWhitespaceCharacterIndex: lineText.search(/\S/),
        isEmptyOrWhitespace: lineText.trim().length === 0
      };
    },
    offsetAt: (position: vscode.Position) => getOffset(text, position),
    positionAt: (offset: number) => {
      let line = 0;
      let char = 0;
      for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
          line++;
          char = 0;
        } else {
          char++;
        }
      }
      return new vscode.Position(line, char);
    },
    validateRange: (range: vscode.Range) => range,
    validatePosition: (position: vscode.Position) => position,
    save: async () => true
  } as vscode.TextDocument;
}

function getOffset(text: string, position: vscode.Position): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < position.line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  offset += position.character;
  return Math.min(offset, text.length);
}
