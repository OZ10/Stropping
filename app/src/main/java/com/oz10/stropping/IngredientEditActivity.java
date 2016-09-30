package com.oz10.stropping;

import android.content.Intent;
import android.os.Bundle;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.Switch;

import com.adapters.database.StroppingDatabase;
import com.classes.BaseItem;
import com.classes.Ingredient;
import com.classes.UOM;

import java.util.List;

public class IngredientEditActivity extends AppCompatActivity {

    Spinner _uomSpinner;
    Spinner _categorySpinner;
    Ingredient _ingredient;
    EditText _ingredientName;
    EditText _quantity;
    Switch _favourite;
    Switch _essential;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ingredient_edit);

        SetupActionbar();

        _ingredientName = (EditText) findViewById(R.id.ingredient_edit_name);
        _quantity = (EditText) findViewById(R.id.ingredient_edit_quantity_value);
        setupSpinners();
        _favourite = (Switch) findViewById(R.id.ingredient_edit_favourite_value);
        _essential = (Switch) findViewById(R.id.ingredient_edit_essential_value);

        Intent intent = getIntent();
        if (intent != null){
            Long ingredientId = intent.getLongExtra("IngredientId", 0);

            if (ingredientId != 0){
                StroppingDatabase db = new StroppingDatabase(this);
                db.open();

                _ingredient = db.getIngredientFromId(ingredientId);
                
                _ingredientName.setText(_ingredient.getName());
                _quantity.setText(String.valueOf(_ingredient.getQuantity()));
                
                _uomSpinner.setSelection(((ArrayAdapter)_uomSpinner.getAdapter()).getPosition(_ingredient.getUOM().getName()));
                _categorySpinner.setSelection(((ArrayAdapter)_categorySpinner.getAdapter()).getPosition(_ingredient.getCategory().getName()));

                _favourite.setChecked(_ingredient.getFavourite());
                _essential.setChecked(_ingredient.getEssential());

                db.close();
            } else {
                _ingredient = new Ingredient();
            }

        }
    }
    
    private void setupSpinners()
    {
        StroppingDatabase db = StroppingDatabase.getInstance(this);
        List<String> valueList = db.getAllUOMNames();

        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, valueList);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        
        _uomSpinner = (Spinner) findViewById(R.id.ingredient_edit_uom_value);
        _uomSpinner.setAdapter(adapter);


        valueList = db.getAllCategoryNames();

        adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, valueList);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);

        _categorySpinner = (Spinner) findViewById(R.id.ingredient_edit_category_value);
        _categorySpinner.setAdapter(adapter);
    }

    private void SetupActionbar()
    {
        ActionBar actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.menu_ok_delete, menu);
        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item){
        switch (item.getItemId())
        {
            case android.R.id.home:
                finish();
                break;

            case R.id.action_menu_delete:
                StroppingDatabase db = new StroppingDatabase(this);
                db.open();

                if (_ingredient.getId() != 0){
                    db.deleteIngredient(_ingredient);
                }

                finish();

                db.close();
                break;

            case R.id.action_menu_ok:
                db = new StroppingDatabase(this);
                db.open();

                String name = _ingredientName.getText().toString();
                //String uom = String.valueOf(_uomSpinner.getSelectedItem());
                UOM uom = db.getUOMByName(String.valueOf(_uomSpinner.getSelectedItem()));
                BaseItem category = db.getCategoryByName(String.valueOf(_categorySpinner.getSelectedItem()));
                int quantity = Integer.valueOf(_quantity.getText().toString());

                int isFavourite = 0; //(_favourite.getChecked()) ? 1 : 0;
                int isEssential = 0; //(_essential.getChecked()) ? 1 : 0;

                if (_ingredient.getId() == 0){
                    // new ingredient
                    _ingredient = db.createIngredient(name, uom.getId(), quantity, quantity, isFavourite, isEssential,0, 0, category.getId());
                }else{
                    db.updateIngredient(_ingredient.getId(), name, uom.getId(), quantity, quantity, isFavourite, isEssential,0, 0, category.getId());
                }

                finish();

                db.close();
                break;
        }

        return true;
    }

}
