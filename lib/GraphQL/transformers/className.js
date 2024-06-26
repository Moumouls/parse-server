"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformClassNameToGraphQL = void 0;
const transformClassNameToGraphQL = className => {
  if (className[0] === '_') {
    className = className.slice(1);
  }
  return className[0].toUpperCase() + className.slice(1);
};
exports.transformClassNameToGraphQL = transformClassNameToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwiLCJjbGFzc05hbWUiLCJzbGljZSIsInRvVXBwZXJDYXNlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9jbGFzc05hbWUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMID0gY2xhc3NOYW1lID0+IHtcbiAgaWYgKGNsYXNzTmFtZVswXSA9PT0gJ18nKSB7XG4gICAgY2xhc3NOYW1lID0gY2xhc3NOYW1lLnNsaWNlKDEpO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWVbMF0udG9VcHBlckNhc2UoKSArIGNsYXNzTmFtZS5zbGljZSgxKTtcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxNQUFNQSwyQkFBMkIsR0FBR0MsU0FBUyxJQUFJO0VBQy9DLElBQUlBLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUU7SUFDeEJBLFNBQVMsR0FBR0EsU0FBUyxDQUFDQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0VBQ2hDO0VBQ0EsT0FBT0QsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDRSxXQUFXLENBQUMsQ0FBQyxHQUFHRixTQUFTLENBQUNDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDeEQsQ0FBQztBQUFDRSxPQUFBLENBQUFKLDJCQUFBLEdBQUFBLDJCQUFBIiwiaWdub3JlTGlzdCI6W119