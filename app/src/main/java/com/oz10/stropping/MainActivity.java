package com.oz10.stropping;

import android.content.Intent;
import android.support.v7.app.AppCompatActivity;

import android.os.Bundle;
import android.support.annotation.IdRes;
import android.support.design.widget.FloatingActionButton;
import android.support.v4.app.Fragment;
import android.support.v7.widget.Toolbar;
import android.view.View;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.ArrayAdapter;

import com.adapters.RecipeListAdapter;
import com.adapters.database.StroppingDatabase;
import com.classes.Recipe;
import com.roughike.bottombar.BottomBar;
import com.roughike.bottombar.OnMenuTabClickListener;

import java.util.ArrayList;

public class MainActivity extends AppCompatActivity {

    static final int ADDNEW_RECIPE_REQUEST = 1;

    private BottomBar _bottombar;
    private MainFragmentPagerAdapter _pagerAdapter;
    private ViewPagerNoSwipe _pager;
    private Toolbar _mainToolbar;
    private FloatingActionButton _mainButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_main);

        _mainButton = (FloatingActionButton) findViewById(R.id.fab);

        SetupToolbar();

        SetupViewPager();

        SetupBottomBar(savedInstanceState);
        
        SetupDatabase();
    }

    private void SetupToolbar()
    {
        _mainToolbar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(_mainToolbar);
        _mainToolbar.setTitle(R.string.Toolbar_ShoppingList);
    }

    private void SetupViewPager()
    {
        _pager = (ViewPagerNoSwipe) findViewById(R.id.pager);
        _pagerAdapter = new MainFragmentPagerAdapter(getSupportFragmentManager());
        _pager.setAdapter(_pagerAdapter);
        _pager.setOffscreenPageLimit(2);

        //Disables swipe navigation
        _pager.setPagingEnabled(false);
    }

    private void SetupBottomBar(Bundle savedInstanceState)
    {
        _bottombar = BottomBar.attach(this, savedInstanceState);
        //_bottombar.setMaxFixedTabs(2);
        _bottombar.setItems(R.menu.bottombar_menu);

        _bottombar.setOnMenuTabClickListener(new OnMenuTabClickListener() {
            @Override
            public void onMenuTabSelected(@IdRes int menuItemId) {
                switch (menuItemId){
                    case R.id.bottomBarItemOne:
                        _pager.setCurrentItem(0);
                        _mainToolbar.setTitle(R.string.Toolbar_ShoppingList);
                        SetMainButtonIcon(0);
                        break;
                    case R.id.bottomBarItemTwo:
                        _pager.setCurrentItem(1);
                        _mainToolbar.setTitle(R.string.Toolbar_Ingredients);
                        SetMainButtonIcon(1);
                        break;
                    case R.id.bottomBarItemThree:
                        _pager.setCurrentItem(2);
                        _mainToolbar.setTitle(R.string.Toolbar_Recipes);
                        SetMainButtonIcon(2);
                        break;
                }
            }

            @Override
            public void onMenuTabReSelected(@IdRes int menuItemId) {

            }
        });
    }
    
    private void SetupDatabase()
    {
        StroppingDatabase stroppingDatabase = new StroppingDatabase(this);
        stroppingDatabase.open();

        stroppingDatabase.ResetAllTables();

        stroppingDatabase = new StroppingDatabase(this);
        stroppingDatabase.open();

        stroppingDatabase.createIngredient("Apple", "number of", 1, 1, 0, 0, 0, 0);
        stroppingDatabase.createIngredient("Pear", "number of", 1, 1, 0, 0, 0, 0);
        stroppingDatabase.createIngredient("Snake", "number of", 1, 1, 0, 0, 0, 0);
        
        stroppingDatabase.createRecipe("Spag", 2, "");
        stroppingDatabase.createRecipe("Spicy Sausage Rice", 2, "");
        stroppingDatabase.createRecipe("Pasta", 2, "");
    }

    public void mainFABClick(View view)
    {
        Fragment currentFragment = (Fragment) _pagerAdapter.GetFragmentByIndex(_pager.getCurrentItem());
        if (currentFragment != null)
        {
          if (currentFragment instanceof ShoppingListFragment){
              addShoppingListItem_Click(1);
          }
            else if (currentFragment instanceof IngredientsListFragment){
              addIngredients_Click((IngredientsListFragment) currentFragment);
          }
            else if (currentFragment instanceof RecipesFragment){
              Intent intent = new Intent(this, RecipeEditActivity.class);
              intent.putExtra("requestCode", ADDNEW_RECIPE_REQUEST);
              startActivityForResult(intent, ADDNEW_RECIPE_REQUEST);
          }
        }
    }

    private void SetMainButtonIcon(int button)
    {
        // Shopping list or recipes
        if (button == 0 || button == 2){
            _mainButton.setImageResource(R.drawable.ic_add_white_24dp);
        }
        else{
            IngredientsListFragment ingredientsListFragment = (IngredientsListFragment) _pagerAdapter.GetFragmentByIndex(1);
            if (ingredientsListFragment._hasSelectedItems){
                _mainButton.setImageResource(R.drawable.ic_playlist_add_white_24dp);
            }
        }

    }

    private void addShoppingListItem_Click(int button) {
        //IngredientsListFragment ingredientsListFragment = (IngredientsListFragment) _pagerAdapter.GetFragmentByIndex(1);
        SelectBottombarTab(button);
    }

    private void addIngredients_Click(IngredientsListFragment ingredientsFrag) {
        //TODO Move all this code to the ingredients fragment
        ArrayList<String> selectedIngredients = ingredientsFrag.getSelectedIngredients_Names();

        if (selectedIngredients.size() != 0){
            // Add ingredients to shopping list
            ShoppingListFragment shoppingListFrag = (ShoppingListFragment) _pagerAdapter.GetFragmentByIndex(0);

            ArrayAdapter<String> shoppingListAdapter = shoppingListFrag.ShoppingListAdapter;

            for (String selectedIngredient:selectedIngredients) {
                shoppingListAdapter.add(selectedIngredient);
            }
            shoppingListAdapter.notifyDataSetChanged();

            SelectBottombarTab(0);
        }
        else
        {
            //TODO Open the add ingredients activity
        }
    }

    private void SelectBottombarTab(int button)
    {
        _bottombar.selectTabAtPosition(button, true);
    }

    @Override
    public void onResume() {
        super.onResume();  // Always call the superclass method first

        RecipesFragment recipesFragment = (RecipesFragment) _pagerAdapter.GetFragmentByIndex(2);

        // Reload all recipes from database to see changes
        if (recipesFragment != null){
            RecipeListAdapter recipeListAdapter = recipesFragment._recipeListAdapter;
            recipeListAdapter.updateAdapterFromDatabase(this);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {

//        if (requestCode == ADDNEW_RECIPE_REQUEST) {
//            if(resultCode == RESULT_OK){
//                //TODO This needs to be refactored
//                RecipesFragment recipesFragment = (RecipesFragment) _pagerAdapter.GetFragmentByIndex(2);
//                RecipeListAdapter recipeListAdapter = recipesFragment._recipeListAdapter;
//                String recipeName = data.getStringExtra("RecipeName");
//                recipeListAdapter.add(new Recipe(recipeName));
//                recipeListAdapter.notifyDataSetChanged();
//            }
//        }
    }

    // DEFAULT 'MY FIRST APP' CODE
    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        // Inflate the menu; this adds items to the action bar if it is present.
        getMenuInflater().inflate(R.menu.menu_shopping_list, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        // Handle action bar item clicks here. The action bar will
        // automatically handle clicks on the Home/Up button, so long
        // as you specify a parent activity in AndroidManifest.xml.
        int id = item.getItemId();

        //noinspection SimplifiableIfStatement
        if (id == R.id.action_settings) {
            return true;
        }

        return super.onOptionsItemSelected(item);
    }
}
