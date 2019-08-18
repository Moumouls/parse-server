const { SDLTransformer } = require('../lib/GraphQL/transformers/SDL');

describe('GraphQLSDLToParseSchema', () => {
  let parseServer;

  beforeAll(async () => {
    parseServer = await global.reconfigureServer({});
  });

  it('should add new fields when not exist in Parse.Schema', async () => {
    await new Parse.Object('Customer').save();
    const typeDefs = `
      type User {
        name: String
      }

      type Team {
        name: String
      }

      type Company {
        name: String
        teams: [Team]
      }
    `;
    new SDLTransformer(parseServer).checkSchema(typeDefs);
  });

  it('should remove fields in Parse.Schema when not exist in SDL', () => {});

  it('should support all fields types', () => {});

  it('should support type User', () => {});

  it('should support type Role', () => {});

  it('should throw an error when try to modifiy type of an existing field', () => {});

  it('should support index directive', () => {});

  it('should add index when not detected in SDL', () => {});

  it('should remove index when not detected in SDL', () => {});

  it('should throw an error when try to modifiy type of an existing field', () => {});
});
