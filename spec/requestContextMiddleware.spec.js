const { ApolloClient, gql, InMemoryCache } = require('@apollo/client/core');
const createUploadLink = (...args) => import('apollo-upload-client/createUploadLink.mjs').then(({ default: fn }) => fn(...args));
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

describe('requestContextMiddleware', () => {
  const requestContextMiddleware = (req, res, next) => {
    req.config.aCustomController = 'aCustomController';
    next();
  };

  it('should support dependency injection on rest api', async () => {
    let called;
    Parse.Cloud.beforeSave('_User', request => {
      expect(request.config.aCustomController).toEqual('aCustomController');
      called = true;
    });
    await reconfigureServer({ requestContextMiddleware });
    const user = new Parse.User();
    user.setUsername('test');
    user.setPassword('test');
    await user.signUp();
    expect(called).toBeTruthy();
  });
  it('should support dependency injection on graphql api', async () => {
    let called = false;
    Parse.Cloud.beforeSave('_User', request => {
      expect(request.config.aCustomController).toEqual('aCustomController');
      called = true;
    });
    await reconfigureServer({
      requestContextMiddleware,
      mountGraphQL: true,
      graphQLPath: '/graphql',
    });
    const httpLink = await createUploadLink({
      uri: 'http://localhost:8378/graphql',
      fetch,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });

    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: httpLink,
    });

    await client.mutate({
      mutation: gql`
        mutation {
          createUser(input: { fields: { username: "test", password: "test" } }) {
            user {
              objectId
            }
          }
        }
      `,
    });
    expect(called).toBeTruthy();
  });
});
